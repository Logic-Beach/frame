import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { html } from 'hono/html'
import type { FrameSignaturePacket } from './types'
import { TokenBalance } from './types'
import { ethers } from "ethers";
import 'dotenv/config'

const app = new Hono()
const providerURL = process.env.QUICKNODE_HTTP_ENDPOINT as string;

// maybe cut this
const tokensAvailabletoBorrow: string[] = [
  '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
];

async function getWalletTokenBalances(walletAddress: string) {
  const response = await fetch(providerURL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      id: 1,
      jsonrpc: "2.0",
      method: "qn_getWalletTokenBalance",
      params: [{
        wallet: walletAddress,
        contracts: tokensAvailabletoBorrow
      }]
    })
  });

  if (!response.ok) {
    throw new Error(`Network response was not ok: ${response.status}`);
  }
  const data = await response.json();
  const tokens = data?.result?.result ?? [];
  const tokenBalances: TokenBalance[] = tokens.map((token: any) => ({
    name: token.name,
    address: token.address,
    totalBalance: token.totalBalance,
    decimals: token.decimals,
  }));

  return tokenBalances
}

//maybe cut this
async function getBorrowPower(tokenArray: TokenBalance[]): Promise<number> {
  let totalBorrowPower = 0;

  const contractsInfo = {
    "USD Coin": { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', collateralFactor: 0.85, id: "usd" },
    "LINK": { address: '0x514910771AF9Ca656af840dff83E8264EcF986CA', collateralFactor: 0.75, id: "link" },
    "Wrapped BTC": { address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', collateralFactor: 0.70, id: "bitcoin" },
    "Ethereum": { address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', collateralFactor: 0.83, id: "ethereum" },
  };

  const borrowPowerPromises = tokenArray.map(async (token) => {
    const tokenInfo = contractsInfo[token.name as keyof typeof contractsInfo];
    if (!tokenInfo) return 0;

    try {
      const tokenBalance = await ethers.formatUnits(token.totalBalance, ethers.toNumber(token.decimals));
      const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${tokenInfo.id}&vs_currencies=usd`);
      const data = await response.json();
      const tokenPrice = data[tokenInfo.id].usd || 1;
      const borrowPower = ((parseFloat(tokenBalance) * tokenPrice) * tokenInfo.collateralFactor);
      return borrowPower;
    } catch (error) {
      console.error('Error fetching token price:', error);
      return 0;
    }
  });

  const results = await Promise.all(borrowPowerPromises);
  totalBorrowPower = results.reduce((acc, curr) => acc + curr, 0);

  return totalBorrowPower;
}

async function getUserfromfId(fid: number) {
  console.log("ran getUserfromfId")
  const url = 'http://192.168.1.177:2281/v1/userDataByFid?fid=';
  try {
    const response = await fetch(`${url}?fid=${fid}`, {
      method: 'GET',
      headers: {
        'accept': 'application/json'
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const userData = await response.json();
    const custodyAddress = userData?.result?.user?.custodyAddress;

    if (!custodyAddress) {
      throw new Error('Custody address not found in response');
    }

    return custodyAddress;
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
}

app.get('/', (c) => {
  const framePostUrl = c.req.url
  const frameImage = `https://placehold.co/1920x1005/grey/white?text=Calculate Borrowing Power on Compound.finance`
  return c.html(html`
    <html lang="en">
      <head>
        <meta property="fc:frame" content="vNext" />
        <meta property="og:image" content="${frameImage}" />
        <meta property="fc:frame:image:aspect_ratio" content="1.91:1" />
        <meta property="fc:frame:image" content="${frameImage}" />
        <meta property="fc:frame:post_url" content="${framePostUrl}" />
        <meta property="fc:frame:button:1" content="Calculate Borrowing Power" />
        <meta property="fc:frame:button:2" content="Source Code" />
        <meta property="fc:frame:button:2:action" content="link" />
        <meta property="fc:frame:button:2:target" content="https://www.quicknode.com/guides/social/how-to-build-a-farcaster-frame" />
        <title>Calculate Borrowing Power on Compound across USDC, WBTC, LINK, WETH, UNI</title>
      </head>
    </html>
  `)
})

app.post('/', async (c) => {

  let borrowPower;

  const framePostUrl = c.req.url
  try {
    const body = await c.req.json<FrameSignaturePacket>();
    const fid = body.untrustedData.fid;
    const userData = await getUserfromfId(fid);
    const tokenBalances = await getWalletTokenBalances(userData)
    if (!tokenBalances) return c.json({ error: 'Token balances not found' }, 400);
    try {
      borrowPower = await (
        await getBorrowPower(tokenBalances)
      ).toLocaleString();
    } catch {
      return c.json({ error: 'Error calculating borrow power' }, 400);
    }
    const borrowImage = `https://placehold.co/1920x1005/grey/white?text=Total BP=$${borrowPower}`
    return c.html(html`
    <html lang="en">
      <head>
        <meta property="fc:frame" content="vNext" />
        <meta property="fc:frame:image" content="${borrowImage}" />
        <meta property="fc:frame:image:aspect_ratio" content="1.91:1" />
        <meta property="fc:frame:button:1:post" content="${framePostUrl}" />
        <meta property="fc:frame:button:1" content="Recalculate Borrowing Power" />
        <meta property="fc:frame:button:2" content="Source Code" />
        <meta property="fc:frame:button:2:action" content="link" />
        <meta property="fc:frame:button:2:target" content="https://www.quicknode.com/guides/social/how-to-build-a-farcaster-frame" />
        <title>Calculate Borrowing Power on Compound across USDC, WBTC, LINK, WETH, UNI</title>
        <title>Borrowing Power Calculator</title>
      </head>
    </html>
  `)

  } catch (error) {
    console.error(error)
    return c.json({ error: 'Invalid request' }, 400)
  }
})

const port = 3000
console.log(`Server is running on port ${port}`)

serve({
  fetch: app.fetch,
  port,
})
