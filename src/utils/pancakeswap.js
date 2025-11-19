import { ethers } from "ethers";
import {
  nearestUsableTick,
  TICK_SPACINGS,
  FeeAmount,
} from "@pancakeswap/v3-sdk";
import { CONTRACTS, TOKENS } from "../config/contracts.js";
import {
  ERC20_ABI,
  FACTORY_ABI,
  QUOTER_ABI,
  SWAP_ROUTER_ABI,
  POSITION_MANAGER_ABI,
  POOL_ABI,
} from "./abis.js";

export function getContracts(chainId) {
  return CONTRACTS[chainId] || CONTRACTS[56];
}

export function getTokens(chainId) {
  return TOKENS[chainId] || TOKENS[56];
}

async function getChainId(provider) {
  return Number((await provider.getNetwork()).chainId);
}

export async function getPoolAddress(tokenA, tokenB, fee, provider) {
  const chainId = await getChainId(provider);
  const factory = new ethers.Contract(
    getContracts(chainId).FACTORY,
    FACTORY_ABI,
    provider
  );
  return await factory.getPool(tokenA, tokenB, fee);
}

export async function findAvailablePool(
  tokenA,
  tokenB,
  provider,
  preferredFee = null
) {
  const fees = preferredFee
    ? [preferredFee, FeeAmount.LOW, FeeAmount.MEDIUM, FeeAmount.HIGH]
    : [FeeAmount.LOW, FeeAmount.MEDIUM, FeeAmount.HIGH];

  for (const fee of [...new Set(fees)]) {
    const poolAddress = await getPoolAddress(tokenA, tokenB, fee, provider);
    if (poolAddress !== ethers.ZeroAddress) {
      return { poolAddress, fee };
    }
  }
  return null;
}

export async function getSwapQuote(tokenIn, tokenOut, amountIn, fee, provider) {
  const chainId = await getChainId(provider);
  const poolAddress = await getPoolAddress(tokenIn, tokenOut, fee, provider);

  if (poolAddress === ethers.ZeroAddress) {
    console.error("[getSwapQuote] Pool does not exist");
    throw new Error(`Pool does not exist for token pair with fee tier ${fee}`);
  }

  try {
    const pool = new ethers.Contract(poolAddress, POOL_ABI, provider);
    const liquidity = await pool.liquidity().catch(() => 0n);
    if (liquidity === 0n) {
      const explorer = chainId === 56 ? "bscscan.com" : "testnet.bscscan.com";
      console.error("[getSwapQuote] Pool has no liquidity");
      throw new Error(
        `Pool has no liquidity. Check: https://${explorer}/address/${poolAddress}`
      );
    }
  } catch (error) {
    if (error.message.includes("no liquidity")) throw error;
  }

  const quoter = new ethers.Contract(
    getContracts(chainId).QUOTER,
    QUOTER_ABI,
    provider
  );

  try {
    const result = await quoter.quoteExactInputSingle.staticCall({
      tokenIn,
      tokenOut,
      amountIn: amountIn.toString(),
      fee,
      sqrtPriceLimitX96: 0,
    });
    const finalResult = Array.isArray(result) ? result[0] : result;
    return finalResult;
  } catch (error) {
    console.error("[getSwapQuote] Quote call failed:", error);
    const explorer = chainId === 56 ? "bscscan.com" : "testnet.bscscan.com";
    throw new Error(
      `Quote failed. Pool: ${poolAddress}. ` +
        `Check: https://${explorer}/address/${poolAddress} ` +
        `Try smaller amount or different token pair.`
    );
  }
}

export async function executeSwap(
  tokenIn,
  tokenOut,
  amountIn,
  amountOutMin,
  fee,
  signer
) {
  const chainId = await getChainId(signer.provider);
  const routerAddress = getContracts(chainId).SWAP_ROUTER;

  const router = new ethers.Contract(routerAddress, SWAP_ROUTER_ABI, signer);

  const recipient = await signer.getAddress();
  const deadline = Math.floor(Date.now() / 1000) + 1200;

  try {
    const tx = await router.exactInputSingle({
      tokenIn,
      tokenOut,
      fee,
      recipient,
      deadline,
      amountIn: amountIn.toString(),
      amountOutMinimum: amountOutMin.toString(),
      sqrtPriceLimitX96: 0,
    });
    return tx;
  } catch (error) {
    console.error("[executeSwap] Swap execution failed:", error);
    throw error;
  }
}

export async function addLiquidity(
  tokenA,
  tokenB,
  amountA,
  amountB,
  fee,
  signer
) {
  const chainId = await getChainId(signer.provider);
  const positionManager = new ethers.Contract(
    getContracts(chainId).NONFUNGIBLE_POSITION_MANAGER,
    POSITION_MANAGER_ABI,
    signer
  );

  const tickSpacing = TICK_SPACINGS[fee];
  const token0 = tokenA.toLowerCase() < tokenB.toLowerCase() ? tokenA : tokenB;
  const token1 = tokenA.toLowerCase() < tokenB.toLowerCase() ? tokenB : tokenA;
  const isToken0A = token0.toLowerCase() === tokenA.toLowerCase();

  return await positionManager.mint({
    token0,
    token1,
    fee,
    tickLower: nearestUsableTick(-887272, tickSpacing),
    tickUpper: nearestUsableTick(887272, tickSpacing),
    amount0Desired: (isToken0A ? amountA : amountB).toString(),
    amount1Desired: (isToken0A ? amountB : amountA).toString(),
    amount0Min: 0,
    amount1Min: 0,
    recipient: await signer.getAddress(),
    deadline: Math.floor(Date.now() / 1000) + 1200,
  });
}

export async function approveToken(tokenAddress, spender, amount, signer) {
  const token = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
  const allowance = await token.allowance(await signer.getAddress(), spender);
  if (allowance < amount) {
    const tx = await token.approve(spender, amount);
    await tx.wait();
    return tx;
  }
}

export async function getTokenDecimals(tokenAddress, provider) {
  try {
    const token = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
    return await token.decimals();
  } catch (error) {
    const chainId = await getChainId(provider);
    const tokens = getTokens(chainId);
    const tokenLower = tokenAddress.toLowerCase();

    let suggestion = "";
    if (
      chainId === 56 &&
      tokenLower === "0xfa60d973f7642b748046464e165a65b7323b0dee"
    ) {
      suggestion = ` Use mainnet CAKE: ${tokens.CAKE}`;
    } else if (
      chainId === 97 &&
      tokenLower === "0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82"
    ) {
      suggestion = ` Use testnet CAKE: ${tokens.CAKE}`;
    } else if (
      chainId === 56 &&
      tokenLower === "0x337610d27c682e347c9cd60bd4b3b107c9d34ddd"
    ) {
      suggestion = ` Use mainnet USDT: ${tokens.USDT}`;
    } else if (
      chainId === 97 &&
      tokenLower === "0x55d398326f99059ff775485246999027b3197955"
    ) {
      suggestion = ` Use testnet USDT: ${tokens.USDT}`;
    }

    throw new Error(
      `Token ${tokenAddress} not found on chainId ${chainId}.${suggestion}`
    );
  }
}
