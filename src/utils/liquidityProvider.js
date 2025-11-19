import { ethers } from "ethers";
import { FeeAmount } from "@pancakeswap/v3-sdk";
import {
  getContracts,
  getTokens,
  approveToken,
  executeSwap,
  addLiquidity,
  getSwapQuote,
  getTokenDecimals,
  findAvailablePool,
} from "./pancakeswap.js";

const FEE_TIER = FeeAmount.MEDIUM;
const SLIPPAGE = 0.5;

export async function provideLiquidity(
  investmentAmount,
  tokenAAddress,
  signer
) {
  const provider = signer.provider;
  const chainId = Number((await provider.getNetwork()).chainId);
  const tokens = getTokens(chainId);
  const userAddress = await signer.getAddress();
  const usdtAddress = tokens.USDT;

  const [usdtDecimals, tokenADecimals] = await Promise.all([
    getTokenDecimals(usdtAddress, provider),
    getTokenDecimals(tokenAAddress, provider),
  ]);

  const investmentWei = ethers.parseUnits(investmentAmount, usdtDecimals);
  const swapAmount = investmentWei / 2n;
  const usdtAmount = investmentWei / 2n;
  const steps = [];

  try {
    steps.push("Finding pool...");
    const poolInfo = await findAvailablePool(
      usdtAddress,
      tokenAAddress,
      provider,
      FEE_TIER
    );
    if (!poolInfo) {
      console.error("[provideLiquidity] No pool found:", {
        usdtAddress,
        tokenAAddress,
        chainId,
        feeTier: FEE_TIER,
      });
      throw new Error(
        "Trading pair not available. Please try a different token."
      );
    }
    const fee = poolInfo.fee;

    steps.push("Approving USDT...");
    await approveToken(
      usdtAddress,
      getContracts(chainId).SWAP_ROUTER,
      swapAmount,
      signer
    );

    steps.push("Getting quote...");
    const amountOut = await getSwapQuote(
      usdtAddress,
      tokenAAddress,
      swapAmount,
      fee,
      provider
    );
    const amountOutMin = (amountOut * BigInt(10000 - SLIPPAGE * 100)) / 10000n;

    steps.push("Swapping...");
    const swapTx = await executeSwap(
      usdtAddress,
      tokenAAddress,
      swapAmount,
      amountOutMin,
      fee,
      signer
    );
    const swapReceipt = await swapTx.wait();

    const tokenA = new ethers.Contract(
      tokenAAddress,
      ["function balanceOf(address) view returns (uint256)"],
      provider
    );
    const tokenABalance = await tokenA.balanceOf(userAddress);

    steps.push("Approving tokens...");
    await Promise.all([
      approveToken(
        tokenAAddress,
        getContracts(chainId).NONFUNGIBLE_POSITION_MANAGER,
        tokenABalance,
        signer
      ),
      approveToken(
        usdtAddress,
        getContracts(chainId).NONFUNGIBLE_POSITION_MANAGER,
        usdtAmount,
        signer
      ),
    ]);

    steps.push("Adding liquidity...");
    const liquidityTx = await addLiquidity(
      tokenAAddress,
      usdtAddress,
      tokenABalance,
      usdtAmount,
      fee,
      signer
    );
    const liquidityReceipt = await liquidityTx.wait();

    let nftTokenId = null;
    const iface = new ethers.Interface([
      "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
    ]);
    for (const log of liquidityReceipt.logs || []) {
      try {
        const parsed = iface.parseLog(log);
        if (
          parsed?.name === "Transfer" &&
          parsed.args.from === ethers.ZeroAddress
        ) {
          nftTokenId = parsed.args.tokenId.toString();
          break;
        }
      } catch {}
    }

    return {
      success: true,
      steps,
      swapTx: swapReceipt.hash,
      liquidityTx: liquidityReceipt.hash,
      nftTokenId,
      tokenAAmount: ethers.formatUnits(tokenABalance, tokenADecimals),
      usdtAmount: ethers.formatUnits(usdtAmount, usdtDecimals),
    };
  } catch (error) {
    console.error("[provideLiquidity] Error:", {
      error: error.message,
      stack: error.stack,
      steps,
      investmentAmount,
      tokenAAddress,
      chainId,
    });
    return { success: false, steps, error: error.message };
  }
}
