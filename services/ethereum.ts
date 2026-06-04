import { BaseDataSource } from '@/services/base';

/** JSON-RPC 2.0 request envelope. */
interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params: unknown[];
}

/** JSON-RPC 2.0 response envelope. */
interface JsonRpcResponse<T> {
  jsonrpc: '2.0';
  id: number;
  result?: T;
  error?: { code: number; message: string; data?: unknown };
}

/** A log entry as returned by `eth_getLogs`. */
export interface EthLog {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;
  transactionHash: string;
  transactionIndex: string;
  blockHash: string;
  logIndex: string;
  removed: boolean;
}

/** A transaction object as returned by `eth_getTransactionByHash`. */
export interface EthTransaction {
  hash: string;
  from: string;
  to: string | null;
  value: string;
  gas: string;
  gasPrice: string;
  nonce: string;
  blockNumber: string | null;
  blockHash: string | null;
  input: string;
}

/** Filter accepted by `eth_getLogs`. */
export interface EthLogFilter {
  fromBlock?: string;
  toBlock?: string;
  address?: string | string[];
  topics?: (string | string[] | null)[];
  blockHash?: string;
}

/** keccak256("Transfer(address,address,uint256)") — ERC-20/721 transfer topic. */
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

/** Left-pads a 20-byte address into a 32-byte topic for log filtering. */
function addressToTopic(address: string): string {
  const clean = address.toLowerCase().replace(/^0x/, '');
  return `0x${clean.padStart(64, '0')}`;
}

/**
 * Ethereum JSON-RPC adapter. Talks to any standard Ethereum node via the URL in
 * `ETHEREUM_RPC_URL`. When the URL is absent the service reports unconfigured
 * and RPC calls throw a clear error rather than hitting a phantom endpoint.
 */
export class EthereumRpcService extends BaseDataSource {
  readonly name = 'ethereum';
  private rpcId = 0;

  constructor() {
    super(process.env.ETHEREUM_RPC_URL || '', { 'Content-Type': 'application/json' });
  }

  /** True only when an RPC endpoint URL is configured. */
  isConfigured(): boolean {
    return Boolean(process.env.ETHEREUM_RPC_URL);
  }

  protected async ping(): Promise<void> {
    await this.getBlockNumber();
  }

  /**
   * Generic JSON-RPC call. Throws if the node returns an `error` object or the
   * service is not configured.
   */
  async rpc<T>(method: string, params: unknown[] = []): Promise<T> {
    if (!this.isConfigured()) {
      throw new Error('ethereum: ETHEREUM_RPC_URL not configured');
    }
    const body: JsonRpcRequest = { jsonrpc: '2.0', id: ++this.rpcId, method, params };
    const res = await this.request<JsonRpcResponse<T>>({ url: '', method: 'POST', data: body });
    if (res.error) {
      throw new Error(`ethereum rpc ${method} error ${res.error.code}: ${res.error.message}`);
    }
    return res.result as T;
  }

  /** Latest block number as a decimal integer. */
  async getBlockNumber(): Promise<number> {
    const hex = await this.rpc<string>('eth_blockNumber');
    return parseInt(hex, 16);
  }

  /** Native ETH balance (in wei, as a bigint) for an address at the latest block. */
  async getBalance(address: string): Promise<bigint> {
    const hex = await this.rpc<string>('eth_getBalance', [address, 'latest']);
    return BigInt(hex);
  }

  /** Full transaction object by hash, or `null` if unknown. */
  async getTransaction(hash: string): Promise<EthTransaction | null> {
    return this.rpc<EthTransaction | null>('eth_getTransactionByHash', [hash]);
  }

  /** Raw event logs matching a filter (`eth_getLogs`). */
  async getLogs(filter: EthLogFilter): Promise<EthLog[]> {
    return this.rpc<EthLog[]>('eth_getLogs', [filter]);
  }

  /**
   * Best-effort ERC-20 transfer history for an address, fetched by scanning the
   * `Transfer` event topic with the address in either the `from` or `to`
   * position. Defaults to a recent block window to stay within node log limits.
   * @param address Wallet address to inspect.
   * @param fromBlock Starting block (hex or tag); defaults to `'earliest'`.
   * @param toBlock Ending block (hex or tag); defaults to `'latest'`.
   */
  async getTokenTransfers(
    address: string,
    fromBlock = 'earliest',
    toBlock = 'latest'
  ): Promise<EthLog[]> {
    const topic = addressToTopic(address);
    const [outgoing, incoming] = await Promise.all([
      this.getLogs({ fromBlock, toBlock, topics: [TRANSFER_TOPIC, topic] }).catch(() => []),
      this.getLogs({ fromBlock, toBlock, topics: [TRANSFER_TOPIC, null, topic] }).catch(() => []),
    ]);
    return [...outgoing, ...incoming].sort(
      (a, b) => parseInt(a.blockNumber, 16) - parseInt(b.blockNumber, 16)
    );
  }
}
