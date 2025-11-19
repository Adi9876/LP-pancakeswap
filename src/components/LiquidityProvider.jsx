import { useState } from 'react';
import { ethers } from 'ethers';
import { provideLiquidity } from '../utils/liquidityProvider.js';
import './LiquidityProvider.css';

export default function LiquidityProvider() {
  const [amount, setAmount] = useState('');
  const [tokenA, setTokenA] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [chainId, setChainId] = useState(null);

  const connectWallet = async () => {
    try {
      if (!window.ethereum) {
        throw new Error('Please install MetaMask or another Web3 wallet');
      }

      const provider = new ethers.BrowserProvider(window.ethereum);
      await provider.send('eth_requestAccounts', []);
      const signer = await provider.getSigner();
      const network = await provider.getNetwork();

      setProvider(provider);
      setSigner(signer);
      setChainId(Number(network.chainId));

      setStatus('Wallet connected');
      setError(null);
    } catch (err) {
      setError(err.message);
      setStatus('');
    }
  };

  const handleInvest = async () => {
    if (!signer || !amount || !tokenA) {
      setError('Please connect wallet, enter amount, and token address');
      return;
    }

    setLoading(true);
    setError(null);
    setStatus('Starting liquidity provision...');
    setResult(null);

    try {
      const result = await provideLiquidity(amount, tokenA, signer);

      if (result.success) {
        setResult(result);
        setStatus('Liquidity provision completed successfully!');
      } else {
        setError(result.error || 'Transaction failed');
        setStatus('');
      }
    } catch (err) {
      setError(err.message || 'Unknown error occurred');
      setStatus('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="liquidity-provider">
      <div className="container">
        <h1>PancakeSwap V3 Liquidity Provider</h1>

        {!signer && (
          <button className="connect-btn" onClick={connectWallet}>
            Connect Wallet
          </button>
        )}

        {signer && (
          <div className="form">
            <div className="input-group">
              <label>Investment Amount (USDT)</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="10000"
                disabled={loading}
              />
            </div>

            <div className="input-group">
              <label>Token A Address</label>
              <input
                type="text"
                value={tokenA}
                onChange={(e) => setTokenA(e.target.value)}
                placeholder="0x..."
                disabled={loading}
              />
              <small>Token to buy with 50% of investment</small>
            </div>

            <button
              className="invest-btn"
              onClick={handleInvest}
              disabled={loading || !amount || !tokenA}
            >
              {loading ? 'Processing...' : 'Invest'}
            </button>
          </div>
        )}

        {status && (
          <div className="status">
            <p>{status}</p>
            {result && result.steps && (
              <ul>
                {result.steps.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {error && (
          <div className="error">
            <p>Error: {error}</p>
          </div>
        )}

        {result && result.success && (
          <div className="result">
            <h3>Success!</h3>
            <p>Swap Transaction: <a href={`https://bscscan.com/tx/${result.swapTx}`} target="_blank" rel="noopener noreferrer">{result.swapTx}</a></p>
            <p>Liquidity Transaction: <a href={`https://bscscan.com/tx/${result.liquidityTx}`} target="_blank" rel="noopener noreferrer">{result.liquidityTx}</a></p>
            {result.nftTokenId && <p>LP NFT Token ID: {result.nftTokenId}</p>}
            <p>Token A Amount: {result.tokenAAmount}</p>
            <p>USDT Amount: {result.usdtAmount}</p>
          </div>
        )}
      </div>
    </div>
  );
}
