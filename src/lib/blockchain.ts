import { ethers, BrowserProvider, Contract, parseEther, formatEther } from 'ethers';
import { CROWDFUNDING_ABI, LUMI_TOKEN_ABI } from '@/contracts/abi';

const CROWDFUNDING_ADDRESS = import.meta.env.VITE_CROWDFUNDING_ADDRESS as string | undefined;
const LUMI_TOKEN_ADDRESS = import.meta.env.VITE_LUMI_TOKEN_ADDRESS as string | undefined;

export const GANACHE_CHAIN_ID = Number(import.meta.env.VITE_GANACHE_CHAIN_ID ?? 1337);
const GANACHE_RPC_URL = (import.meta.env.VITE_GANACHE_RPC_URL as string | undefined) ?? 'http://127.0.0.1:7545';

export function isBlockchainConfigured(): boolean {
  return Boolean(CROWDFUNDING_ADDRESS && LUMI_TOKEN_ADDRESS);
}

export function isMetaMaskInstalled(): boolean {
  return Boolean(window.ethereum?.isMetaMask);
}

function getEthereum(): MetaMaskProvider {
  if (!window.ethereum) throw new Error('MetaMask is not installed. Please install MetaMask to use this feature.');
  return window.ethereum;
}

function getProvider(): BrowserProvider {
  return new BrowserProvider(getEthereum() as ethers.Eip1193Provider);
}

async function getSigner() {
  return getProvider().getSigner();
}

function contractCrowdfunding(runner: ethers.ContractRunner): Contract {
  if (!CROWDFUNDING_ADDRESS) throw new Error('Crowdfunding contract address not configured.');
  return new Contract(CROWDFUNDING_ADDRESS, CROWDFUNDING_ABI, runner);
}

function contractLumiToken(runner: ethers.ContractRunner): Contract {
  if (!LUMI_TOKEN_ADDRESS) throw new Error('LUMI token address not configured.');
  return new Contract(LUMI_TOKEN_ADDRESS, LUMI_TOKEN_ABI, runner);
}

// ── MetaMask connection ───────────────────────────────────────────

export async function requestAccount(): Promise<string> {
  const accounts = await getEthereum().request({ method: 'eth_requestAccounts' }) as string[];
  if (!accounts[0]) throw new Error('MetaMask returned no accounts.');
  return accounts[0];
}

export async function getCurrentAccount(): Promise<string | null> {
  if (!window.ethereum) return null;
  const accounts = await window.ethereum.request({ method: 'eth_accounts' }) as string[];
  return accounts[0] ?? null;
}

export async function getChainId(): Promise<number> {
  const hex = await getEthereum().request({ method: 'eth_chainId' }) as string;
  return parseInt(hex, 16);
}

export async function switchToGanache(): Promise<void> {
  const chainIdHex = `0x${GANACHE_CHAIN_ID.toString(16)}`;
  try {
    await getEthereum().request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: chainIdHex }],
    });
  } catch (err: unknown) {
    if ((err as { code?: number }).code === 4902) {
      await getEthereum().request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: chainIdHex,
          chainName: 'Ganache Local',
          rpcUrls: [GANACHE_RPC_URL],
          nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
        }],
      });
    } else {
      throw err;
    }
  }
}

// ── Admin ─────────────────────────────────────────────────────────

export async function queryAdminAddress(): Promise<string> {
  return String(await contractCrowdfunding(getProvider()).admin());
}

export async function txApproveCampaign(campaignId: number): Promise<void> {
  const signer = await getSigner();
  await (await contractCrowdfunding(signer).approveCampaign(campaignId)).wait();
}

export async function txRejectCampaign(campaignId: number, reason: string): Promise<void> {
  const signer = await getSigner();
  await (await contractCrowdfunding(signer).rejectCampaign(campaignId, reason)).wait();
}

// ── Campaign types ────────────────────────────────────────────────

export type ChainCampaignStatus = 'pending' | 'active' | 'successful' | 'failed' | 'rejected';

export interface ChainCampaign {
  id: number;
  creator: string;
  title: string;
  description: string;
  goalWei: bigint;
  raisedWei: bigint;
  deadline: number;
  withdrawn: boolean;
  status: ChainCampaignStatus;
  rejectionReason?: string;
}

function parseStatus(code: number): ChainCampaignStatus {
  if (code === 0) return 'pending';
  if (code === 1) return 'active';
  if (code === 2) return 'successful';
  if (code === 3) return 'failed';
  return 'rejected';
}

async function loadCampaign(contract: Contract, id: number): Promise<ChainCampaign> {
  const [c, statusCode] = await Promise.all([
    contract.campaigns(id),
    contract.getCampaignStatus(id),
  ]);
  const status = parseStatus(Number(statusCode));
  const campaign: ChainCampaign = {
    id,
    creator: c.creator as string,
    title: c.title as string,
    description: c.description as string,
    goalWei: BigInt(c.goal),
    raisedWei: BigInt(c.raised),
    deadline: Number(c.deadline),
    withdrawn: c.withdrawn as boolean,
    status,
  };
  if (status === 'rejected') {
    campaign.rejectionReason = String(await contract.rejectionReasons(id));
  }
  return campaign;
}

// ── Read functions ────────────────────────────────────────────────

export async function fetchAllCampaigns(): Promise<ChainCampaign[]> {
  const provider = getProvider();
  const contract = contractCrowdfunding(provider);
  const count = Number(await contract.campaignCount());
  if (count === 0) return [];
  return Promise.all(Array.from({ length: count }, (_, i) => loadCampaign(contract, i + 1)));
}

export async function fetchCampaign(id: number): Promise<ChainCampaign> {
  return loadCampaign(contractCrowdfunding(getProvider()), id);
}

export async function queryContribution(campaignId: number, address: string): Promise<bigint> {
  return BigInt(await contractCrowdfunding(getProvider()).contributions(campaignId, address));
}

export async function queryLumiClaimed(campaignId: number, address: string): Promise<boolean> {
  return Boolean(await contractCrowdfunding(getProvider()).lumiClaimed(campaignId, address));
}

export async function queryLumiBalance(address: string): Promise<bigint> {
  return BigInt(await contractLumiToken(getProvider()).balanceOf(address));
}

export async function queryReturnPool(campaignId: number): Promise<bigint> {
  return BigInt(await contractCrowdfunding(getProvider()).returnPool(campaignId));
}

export async function queryReturnClaimed(campaignId: number, address: string): Promise<bigint> {
  return BigInt(await contractCrowdfunding(getProvider()).returnsClaimed(campaignId, address));
}

export async function fetchUserContributedIds(address: string): Promise<number[]> {
  const contract = contractCrowdfunding(getProvider());
  const filter = contract.filters.Contributed(null, address);
  const events = await contract.queryFilter(filter) as ethers.EventLog[];
  const ids = new Set(events.map(e => Number(e.args[0])));
  return Array.from(ids);
}

// ── Write functions ───────────────────────────────────────────────

export async function txCreateCampaign(
  title: string,
  description: string,
  goalEth: string,
  deadlineDate: string,
): Promise<number> {
  const signer = await getSigner();
  const contract = contractCrowdfunding(signer);
  const tx = await contract.createCampaign(
    title,
    description,
    parseEther(goalEth),
    Math.floor(new Date(deadlineDate).getTime() / 1000),
  );
  const receipt = await tx.wait();
  for (const log of receipt.logs as ethers.Log[]) {
    try {
      const parsed = contract.interface.parseLog({ data: log.data, topics: [...log.topics] });
      if (parsed?.name === 'CampaignCreated') return Number(parsed.args.id);
    } catch { /* not this contract's log */ }
  }
  return 0;
}

export async function txContribute(campaignId: number, amountEth: string): Promise<void> {
  const signer = await getSigner();
  await (await contractCrowdfunding(signer).contribute(campaignId, { value: parseEther(amountEth) })).wait();
}

export async function txWithdraw(campaignId: number): Promise<void> {
  const signer = await getSigner();
  await (await contractCrowdfunding(signer).withdraw(campaignId)).wait();
}

export async function txClaimRefund(campaignId: number): Promise<void> {
  const signer = await getSigner();
  await (await contractCrowdfunding(signer).claimRefund(campaignId)).wait();
}

export async function txClaimLumi(campaignId: number): Promise<void> {
  const signer = await getSigner();
  await (await contractCrowdfunding(signer).claimLumi(campaignId)).wait();
}

export async function txDistributeReturns(campaignId: number, amountEth: string): Promise<void> {
  const signer = await getSigner();
  await (await contractCrowdfunding(signer).distributeReturns(campaignId, { value: parseEther(amountEth) })).wait();
}

export async function txClaimReturn(campaignId: number): Promise<void> {
  const signer = await getSigner();
  await (await contractCrowdfunding(signer).claimReturn(campaignId)).wait();
}

// ── Helpers ───────────────────────────────────────────────────────

export function weiToEth(wei: bigint): number {
  return parseFloat(formatEther(wei));
}

export function formatError(err: unknown): string {
  if (err instanceof Error) {
    if (err.message.includes('user rejected') || err.message.includes('ACTION_REJECTED')) return 'Transaction rejected by user.';
    if (err.message.includes('insufficient funds')) return 'Insufficient ETH balance.';
    if (err.message.includes('Not admin')) return 'Only the admin can perform this action.';
    if (err.message.includes('not yet approved')) return 'This campaign has not been approved yet.';
    if (err.message.includes('Already approved')) return 'Campaign is already approved.';
    if (err.message.includes('Already rejected')) return 'Campaign is already rejected.';
    if (err.message.includes('Goal not reached')) return 'Campaign goal was not reached.';
    if (err.message.includes('Already withdrawn')) return 'Funds have already been withdrawn.';
    if (err.message.includes('Nothing to refund')) return 'No refund available for this address.';
    if (err.message.includes('Already claimed')) return 'LUMI tokens already claimed.';
    if (err.message.includes('Funds not yet withdrawn')) return 'You must withdraw campaign funds before distributing returns.';
    if (err.message.includes('No returns available')) return 'No returns have been distributed yet.';
    if (err.message.includes('Nothing to claim')) return 'No new returns to claim.';
    return err.message.slice(0, 120);
  }
  return 'An unknown error occurred.';
}
