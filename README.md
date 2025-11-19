# PancakeSwap V3 Liquidity Provider UI

Simple UI for providing liquidity to PancakeSwap V3 pools on BNB Chain.

## Features

- **One-click liquidity provision** after token approval
- **Automatic token swap**: 50% USDT → Token A, 50% stays as USDT
- **Automatic liquidity addition** to V3 pool
- **LP NFT creation** with position tracking
- **Simple, clean UI** with status updates

## Setup

1. Install dependencies:
```bash
npm install
```

2. Start development server:
```bash
npm run dev
```

3. Open browser to `http://localhost:3000`

## Usage

1. **Connect Wallet**: Click "Connect Wallet" and approve connection
2. **Enter Amount**: Input investment amount in USDT (e.g., 10000)
3. **Enter Token Address**: Provide Token A contract address (token to buy)
4. **Approve Tokens**: Approve USDT and Token A when prompted (one-time per token)
5. **Invest**: Click "Invest" button

The system will:
- Swap 50% USDT for Token A
- Add both tokens as liquidity to the V3 pool
- Create an LP NFT position

## Configuration

Edit `src/config/contracts.js` to:
- Change network (mainnet/testnet)
- Update contract addresses if needed
- Modify default token pairs

## Network Support

- **BNB Chain Mainnet** (Chain ID: 56)
- **BNB Chain Testnet** (Chain ID: 97)

## Technical Details

- Uses PancakeSwap V3 SDK for pool interactions
- Integrates with SwapRouter V3 for token swaps
- Uses NonfungiblePositionManager for liquidity positions
- Full-range liquidity by default (can be customized)

## Important Notes

- Ensure you have sufficient USDT balance
- Ensure the token pair pool exists on PancakeSwap V3
- Test on testnet first before using mainnet
- Gas fees apply for all transactions
