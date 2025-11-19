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
    console.error("[getSwapQuote] Pool does not exist", {
      tokenIn,
      tokenOut,
      fee,
      chainId,
    });
    throw new Error(
      "Trading pair not available. Please try a different token."
    );
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
    console.error("[getSwapQuote] Quote call failed:", {
      error: error.message,
      stack: error.stack,
      tokenIn,
      tokenOut,
      amountIn: amountIn.toString(),
      fee,
      poolAddress,
      chainId,
    });
    throw new Error(
      "Unable to get price quote. Try a smaller amount or different token."
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
    console.error("[executeSwap] Swap execution failed:", {
      error: error.message,
      stack: error.stack,
      code: error.code,
      data: error.data,
      tokenIn,
      tokenOut,
      amountIn: amountIn.toString(),
      amountOutMin: amountOutMin.toString(),
      fee,
      chainId,
      routerAddress,
    });

    if (error.message && error.message.includes("user rejected")) {
      throw new Error("Transaction cancelled. Please try again.");
    }
    if (error.message && error.message.includes("insufficient funds")) {
      throw new Error("Not enough balance. Please check your wallet.");
    }
    throw new Error("Swap failed. Please try again.");
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

  try {
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
  } catch (error) {
    console.error("[addLiquidity] Error:", {
      error: error.message,
      stack: error.stack,
      code: error.code,
      tokenA,
      tokenB,
      amountA: amountA.toString(),
      amountB: amountB.toString(),
      fee,
      chainId,
    });

    if (error.message && error.message.includes("user rejected")) {
      throw new Error("Transaction cancelled. Please try again.");
    }
    if (error.message && error.message.includes("insufficient funds")) {
      throw new Error("Not enough balance. Please check your wallet.");
    }
    throw new Error("Failed to add liquidity. Please try again.");
  }
}

export async function approveToken(tokenAddress, spender, amount, signer) {
  try {
    const token = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
    const allowance = await token.allowance(await signer.getAddress(), spender);
    if (allowance < amount) {
      const tx = await token.approve(spender, amount);
      await tx.wait();
      return tx;
    }
  } catch (error) {
    console.error("[approveToken] Error:", {
      error: error.message,
      stack: error.stack,
      code: error.code,
      tokenAddress,
      spender,
      amount: amount.toString(),
    });

    if (error.message && error.message.includes("user rejected")) {
      throw new Error("Transaction cancelled. Please try again.");
    }
    throw new Error("Failed to approve token. Please try again.");
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

    console.error("[getTokenDecimals] Token not found:", {
      error: error.message,
      stack: error.stack,
      tokenAddress,
      chainId,
      tokenLower,
    });

    throw new Error("Invalid token address. Please check and try again.");
  }
}
