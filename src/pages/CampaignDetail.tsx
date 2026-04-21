import { useParams, Navigate, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { Clock, User, Target, TrendingUp, Loader2 } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Layout } from '@/components/Layout';
import { ContributeModal } from '@/components/ContributeModal';
import {
  MOCK_CAMPAIGNS,
  chainToFrontend,
  formatETH,
  formatAddress,
  getDaysLeft,
  getStatusColor,
  getStatusLabel,
  useWalletStore,
  isBlockchainConfigured,
  ROUTE_PATHS,
  type Campaign,
} from '@/lib/index';
import {
  fetchCampaign,
  queryContribution,
  queryLumiClaimed,
  queryReturnPool,
  queryReturnClaimed,
  txWithdraw,
  txClaimRefund,
  txClaimLumi,
  txDistributeReturns,
  txClaimReturn,
  weiToEth,
  formatError,
} from '@/lib/blockchain';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

export default function CampaignDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isConnected, address } = useWalletStore();
  const [modalOpen, setModalOpen] = useState(false);
  const [txPending, setTxPending] = useState(false);
  const [distributeAmount, setDistributeAmount] = useState('');
  const queryClient = useQueryClient();
  const chainEnabled = isBlockchainConfigured();
  const campaignId = Number(id);

  // ── Campaign data ────────────────────────────────────────────────
  const { data: chainCampaign, isLoading: campaignLoading } = useQuery({
    queryKey: ['campaign', id],
    queryFn: () => fetchCampaign(campaignId),
    enabled: chainEnabled && !!id && !isNaN(campaignId),
    staleTime: 15_000,
  });

  const campaign: Campaign | null = chainEnabled
    ? (chainCampaign ? chainToFrontend(chainCampaign) : null)
    : (MOCK_CAMPAIGNS.find(c => c.id === id) ?? null);

  // ── User-specific on-chain data ──────────────────────────────────
  const { data: userContributionWei = 0n } = useQuery({
    queryKey: ['contribution', id, address],
    queryFn: () => queryContribution(campaignId, address!),
    enabled: chainEnabled && !!address && !!id && !isNaN(campaignId),
    staleTime: 15_000,
  });

  const { data: lumiAlreadyClaimed = false } = useQuery({
    queryKey: ['lumiClaimed', id, address],
    queryFn: () => queryLumiClaimed(campaignId, address!),
    enabled: chainEnabled && !!address && !!id && campaign?.status === 'successful',
    staleTime: 15_000,
  });

  const { data: returnPoolWei = 0n } = useQuery({
    queryKey: ['returnPool', id],
    queryFn: () => queryReturnPool(campaignId),
    enabled: chainEnabled && !!id && campaign?.status === 'successful',
    staleTime: 15_000,
  });

  const { data: returnClaimedWei = 0n } = useQuery({
    queryKey: ['returnClaimed', id, address],
    queryFn: () => queryReturnClaimed(campaignId, address!),
    enabled: chainEnabled && !!address && !!id && campaign?.status === 'successful',
    staleTime: 15_000,
  });

  const userContributionEth = weiToEth(userContributionWei);
  const isCreator = !!address && !!campaign && address.toLowerCase() === campaign.creator.toLowerCase();
  const isContributor = chainEnabled ? userContributionWei > 0n : true;

  const claimableReturnWei = returnPoolWei > 0n && chainCampaign && userContributionWei > 0n
    ? (userContributionWei * returnPoolWei) / chainCampaign.raisedWei - returnClaimedWei
    : 0n;

  // ── Transaction handlers ─────────────────────────────────────────
  async function withTx(fn: () => Promise<void>, successMsg: string, invalidateKeys: string[][]) {
    setTxPending(true);
    try {
      await fn();
      invalidateKeys.forEach(key => queryClient.invalidateQueries({ queryKey: key }));
      toast.success(successMsg);
    } catch (err) {
      toast.error(formatError(err));
    } finally {
      setTxPending(false);
    }
  }

  const handleWithdraw = () =>
    withTx(
      () => txWithdraw(campaignId),
      'Funds withdrawn successfully!',
      [['campaign', id], ['campaigns']],
    );

  const handleClaimRefund = () =>
    withTx(
      () => txClaimRefund(campaignId),
      'Refund claimed successfully!',
      [['campaign', id], ['contribution', id, address]],
    );

  const handleClaimLumi = () =>
    withTx(
      () => txClaimLumi(campaignId),
      'LUMI tokens claimed!',
      [['lumiClaimed', id, address]],
    );

  const handleDistributeReturns = () => {
    if (!distributeAmount || parseFloat(distributeAmount) <= 0) return;
    withTx(
      () => txDistributeReturns(campaignId, distributeAmount),
      `${distributeAmount} ETH distributed to investors!`,
      [['returnPool', id]],
    ).then(() => setDistributeAmount(''));
  };

  const handleClaimReturn = () =>
    withTx(
      () => txClaimReturn(campaignId),
      'Return claimed successfully!',
      [['returnPool', id], ['returnClaimed', id, address]],
    );

  // ── Redirect ─────────────────────────────────────────────────────
  if (campaignLoading) {
    return (
      <Layout>
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="w-10 h-10 text-accent animate-spin" />
        </div>
      </Layout>
    );
  }

  if (!campaign) return <Navigate to={ROUTE_PATHS.EXPLORE} replace />;

  const progress = (campaign.current / campaign.goal) * 100;
  const daysLeft = getDaysLeft(campaign.deadline);

  return (
    <Layout>
      <div className="min-h-screen py-24">
        <div className="container mx-auto px-4 max-w-5xl">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <div className="relative w-full h-[400px] rounded-2xl overflow-hidden mb-8">
              <img src={campaign.image} alt={campaign.title} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent" />
              <div className="absolute top-6 right-6">
                <Badge className={`${getStatusColor(campaign.status)} border px-4 py-2 text-sm font-medium backdrop-blur-sm`}>
                  {getStatusLabel(campaign.status)}
                </Badge>
              </div>
            </div>

            <div className="grid lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-8">
                <div>
                  <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                    {campaign.title}
                  </h1>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <User className="w-4 h-4" />
                    <span className="text-sm">Created by</span>
                    <code className="font-mono text-sm bg-muted/50 px-2 py-1 rounded">
                      {formatAddress(campaign.creator)}
                    </code>
                    {isCreator && <Badge variant="outline" className="text-xs border-accent/40 text-accent">You</Badge>}
                  </div>
                </div>

                <Card className="p-6 bg-card/60 backdrop-blur-md border-border/50">
                  <h2 className="text-xl font-semibold mb-4">About This Project</h2>
                  <p className="text-muted-foreground leading-relaxed whitespace-pre-line">{campaign.description}</p>
                </Card>

                {chainEnabled && isConnected && userContributionEth > 0 && (
                  <Card className="p-4 bg-accent/5 border-accent/30">
                    <p className="text-sm text-muted-foreground">
                      Your contribution: <span className="font-mono font-semibold text-accent">{formatETH(userContributionEth)}</span>
                    </p>
                  </Card>
                )}
              </div>

              <div className="space-y-6">
                <Card className="p-6 bg-card/80 backdrop-blur-md border-border/50 sticky top-24">
                  <div className="space-y-6">
                    {/* Funding progress */}
                    <div>
                      <div className="flex items-baseline justify-between mb-2">
                        <span className="text-3xl font-bold font-mono">{formatETH(campaign.current)}</span>
                        <span className="text-sm text-muted-foreground">of {formatETH(campaign.goal)}</span>
                      </div>
                      <div className="relative h-3 bg-muted/30 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.min(progress, 100)}%` }}
                          transition={{ duration: 1, ease: 'easeOut' }}
                          className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary to-accent rounded-full"
                          style={{ boxShadow: '0 0 20px rgba(59,130,246,0.5)' }}
                        />
                      </div>
                      <div className="flex items-center justify-between mt-2 text-sm">
                        <span className="text-muted-foreground">{progress.toFixed(1)}% funded</span>
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <TrendingUp className="w-4 h-4" />
                          <span>{Math.round(progress)}%</span>
                        </div>
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border/50">
                      <div>
                        <div className="flex items-center gap-2 text-muted-foreground mb-1">
                          <Clock className="w-4 h-4" />
                          <span className="text-xs uppercase tracking-wide">Time Left</span>
                        </div>
                        <p className="text-2xl font-bold">{daysLeft > 0 ? `${daysLeft}d` : '0d'}</p>
                      </div>
                      <div>
                        <div className="flex items-center gap-2 text-muted-foreground mb-1">
                          <Target className="w-4 h-4" />
                          <span className="text-xs uppercase tracking-wide">Goal</span>
                        </div>
                        <p className="text-2xl font-bold font-mono">{campaign.goal} ETH</p>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="pt-4 border-t border-border/50 space-y-3">

                      {/* Pending: awaiting admin approval */}
                      {campaign.status === 'pending' && (
                        <div className="text-center py-2">
                          <p className="text-sm font-medium text-yellow-400 mb-1">Awaiting Admin Approval</p>
                          <p className="text-xs text-muted-foreground">This campaign is under review and cannot accept contributions yet.</p>
                        </div>
                      )}

                      {/* Rejected */}
                      {campaign.status === 'rejected' && (
                        <div className="text-center py-2">
                          <p className="text-sm font-medium text-orange-400 mb-1">Campaign Rejected</p>
                          {chainCampaign?.rejectionReason && (
                            <p className="text-xs text-muted-foreground">Reason: {chainCampaign.rejectionReason}</p>
                          )}
                        </div>
                      )}

                      {/* Active: Contribute */}
                      {campaign.status === 'active' && (
                        isConnected ? (
                          <Button
                            onClick={() => setModalOpen(true)}
                            disabled={txPending}
                            className="w-full bg-gradient-to-r from-primary to-accent hover:opacity-90 transition-opacity"
                            size="lg"
                          >
                            Contribute Now
                          </Button>
                        ) : (
                          <div className="text-center">
                            <p className="text-sm text-muted-foreground mb-3">Connect wallet to contribute</p>
                            <Button onClick={() => useWalletStore.getState().connect()} variant="outline" className="w-full">
                              Connect Wallet
                            </Button>
                          </div>
                        )
                      )}

                      {/* Successful: Creator can withdraw, contributor can claim LUMI */}
                      {campaign.status === 'successful' && (
                        isConnected ? (
                          <>
                            {isCreator && !chainCampaign?.withdrawn && chainEnabled && (
                              <Button
                                onClick={handleWithdraw}
                                disabled={txPending}
                                className="w-full bg-chart-3 hover:bg-chart-3/90 text-white"
                                size="lg"
                              >
                                {txPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                                Withdraw Funds
                              </Button>
                            )}
                            {isCreator && chainCampaign?.withdrawn && chainEnabled && (
                              <p className="text-sm text-center text-muted-foreground">Funds already withdrawn</p>
                            )}
                            {!isCreator && isContributor && !lumiAlreadyClaimed && (
                              <Button
                                onClick={chainEnabled ? handleClaimLumi : undefined}
                                disabled={txPending}
                                className="w-full bg-chart-3 hover:bg-chart-3/90 text-white"
                                size="lg"
                              >
                                {txPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                                Claim LUMI Reward
                              </Button>
                            )}
                            {!isCreator && lumiAlreadyClaimed && (
                              <p className="text-sm text-center text-muted-foreground">LUMI already claimed</p>
                            )}

                            {/* Distribute Returns — creator only, after withdrawal */}
                            {isCreator && chainCampaign?.withdrawn && chainEnabled && (
                              <div className="pt-3 border-t border-border/50 space-y-2">
                                <p className="text-xs text-muted-foreground">
                                  Send profit share back to investors:
                                  {returnPoolWei > 0n && (
                                    <span className="ml-1 text-chart-3">{weiToEth(returnPoolWei).toFixed(4)} ETH distributed so far</span>
                                  )}
                                </p>
                                <div className="flex gap-2">
                                  <Input
                                    type="number"
                                    step="0.001"
                                    min="0"
                                    placeholder="ETH amount"
                                    value={distributeAmount}
                                    onChange={e => setDistributeAmount(e.target.value)}
                                    className="bg-background/50 border-border/50 text-sm h-9"
                                  />
                                  <Button
                                    onClick={handleDistributeReturns}
                                    disabled={txPending || !distributeAmount || parseFloat(distributeAmount) <= 0}
                                    size="sm"
                                    className="bg-chart-3 hover:bg-chart-3/90 text-white whitespace-nowrap"
                                  >
                                    {txPending ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Send Returns'}
                                  </Button>
                                </div>
                              </div>
                            )}

                            {/* Claim Return — investors */}
                            {!isCreator && isContributor && returnPoolWei > 0n && chainEnabled && (
                              <div className="pt-3 border-t border-border/50 space-y-2">
                                <p className="text-xs text-muted-foreground">
                                  Profit share available:{' '}
                                  <span className="text-chart-3 font-mono font-semibold">
                                    {weiToEth(claimableReturnWei).toFixed(6)} ETH
                                  </span>
                                </p>
                                {claimableReturnWei > 0n ? (
                                  <Button
                                    onClick={handleClaimReturn}
                                    disabled={txPending}
                                    size="sm"
                                    className="w-full bg-chart-3 hover:bg-chart-3/90 text-white"
                                  >
                                    {txPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                                    Claim Profit Share
                                  </Button>
                                ) : (
                                  <p className="text-xs text-center text-muted-foreground">Profit share already claimed</p>
                                )}
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="text-center">
                            <p className="text-sm text-muted-foreground mb-3">Connect wallet to claim rewards</p>
                            <Button onClick={() => useWalletStore.getState().connect()} variant="outline" className="w-full">
                              Connect Wallet
                            </Button>
                          </div>
                        )
                      )}

                      {/* Failed: Contributor can claim refund */}
                      {campaign.status === 'failed' && (
                        isConnected ? (
                          isContributor ? (
                            <Button
                              onClick={chainEnabled ? handleClaimRefund : undefined}
                              disabled={txPending}
                              variant="outline"
                              className="w-full border-destructive text-destructive hover:bg-destructive/10"
                              size="lg"
                            >
                              {txPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                              Claim Refund
                            </Button>
                          ) : (
                            <p className="text-sm text-center text-muted-foreground">No contribution to refund</p>
                          )
                        ) : (
                          <div className="text-center">
                            <p className="text-sm text-muted-foreground mb-3">Connect wallet to claim refund</p>
                            <Button onClick={() => useWalletStore.getState().connect()} variant="outline" className="w-full">
                              Connect Wallet
                            </Button>
                          </div>
                        )
                      )}

                      {!chainEnabled && (
                        <p className="text-xs text-center text-muted-foreground/60">Demo mode — transactions simulated</p>
                      )}
                    </div>
                  </div>
                </Card>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      <ContributeModal
        campaign={campaign}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['campaign', id] });
          queryClient.invalidateQueries({ queryKey: ['campaigns'] });
          queryClient.invalidateQueries({ queryKey: ['contribution', id, address] });
          navigate(ROUTE_PATHS.EXPLORE);
        }}
      />
    </Layout>
  );
}
