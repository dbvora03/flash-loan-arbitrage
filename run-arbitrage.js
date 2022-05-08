require('dotenv').config()
const Web3 = require('web3');
const abis = require('./abis')
const { ChainId, Token, TokenAmount, Pair, Fetcher } = require('@uniswap/sdk')
const { mainnet: addresses} = require('./addresses')

const web3 = new Web3(
  new Web3.providers.WebsocketProvider(process.env.INFURA)
);

const kyber = new web3.eth.Contract(
  abis.kyber.kyberNetworkProxy,
  addresses.kyber.kyberNetworkProxy
)

const AMOUNT_ETH = 100;
const RECENT_ETH_PRICE = 2547;
const AMOUNT_ETH_WEI = web3.utils.toWei(AMOUNT_ETH.toString())
const AMOUNT_DAI_WEI = web3.utils.toWei((AMOUNT_ETH * RECENT_ETH_PRICE).toString())

const init = async () => {

  const [dai, weth] = await Promise.all(
    [addresses.tokens.dai, addresses.tokens.weth].map(tokenAddress => (
      new Token(
        ChainId.MAINNET,
        tokenAddress,
        18
      )
  )));

  const daiWeth = await Fetcher.fetchPairData(
    dai,
    weth
  );
  web3.eth.subscribe('newBlockHeaders').on('data', async block => {
    console.log(`New Block received. Block # ${block.number}`)
  
    const kyberResults = await Promise.all([
      kyber.methods.getExpectedRate(
        addresses.tokens.dai,
        '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
        AMOUNT_DAI_WEI
      ).call(),
      kyber.methods.getExpectedRate(
        addresses.tokens.dai,
        '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
        AMOUNT_ETH_WEI
      ).call()
    ])
  
    const kyberRates = {
      buy: parseFloat(1 / (kyberResults[0].expectedRate / (10**18))),
      sell: parseFloat(kyberResults[1].expectedRate / (10 ** 18))
    }
  
    const uniswapResults = await Promise.all([
      daiWeth.getOutputAmount(new TokenAmount(dai, AMOUNT_DAI_WEI)),
      daiWeth.getOutputAmount(new TokenAmount(weth, AMOUNT_ETH_WEI))
    ]);

    const uniswapRates = {
      buy: parseFloat( AMOUNT_DAI_WEI / (uniswapResults[0][0].toExact() * 10 ** 18)),
      sell: parseFloat(uniswapResults[1][0].toExact() / AMOUNT_ETH),
    };
    console.log("Kyber")
    console.log(kyberRates)
    console.log("Uniswap")
    console.log(uniswapRates);

    const gasPrice = await web3.eth.getGasPrice()
    const txnCost = 200000 * parseInt(gasPrice)
    const currentEthPrice = (uniswapRates.buy + uniswapRates.sell) / 2
    const profit1 = (parseInt(AMOUNT_ETH_WEI) / 10 ** 18) * (uniswapRates.sell - kyberRates.buy) - (txnCost / 10 ** 18) * currentEthPrice
    const profit2 = (parseInt(AMOUNT_ETH_WEI) / 10 ** 18) * (kyberRates.sell - uniswapRates.buy) - (txnCost / 10 ** 18) * currentEthPrice
    
    if (profit1 > 0) {
      console.log('Arb opportunity found!');
      console.log(`Buy ETH on Kyber at ${kyberRates.buy} dai`);
      console.log(`Sell ETH on Uniswap at ${uniswapRates.sell} dai`);
      console.log(`Expected profit: ${profit1} dai`);
      //Execute arb Kyber <=> Uniswap
    } else if(profit2 > 0) {
      console.log('Arb opportunity found!');
      console.log(`Buy ETH from Uniswap at ${uniswapRates.buy} dai`);
      console.log(`Sell ETH from Kyber at ${kyberRates.sell} dai`);
      console.log(`Expected profit: ${profit2} dai`);
      //Execute arb Uniswap <=> Kyber
    }


  }).on('error', error => {
    console.log(error)
  })
}

init()