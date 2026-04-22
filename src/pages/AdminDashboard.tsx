import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ShieldCheck, CheckCircle, XCircle, Loader2, Clock, AlertCircle, FileText, Vote, Landmark } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Layout } from '@/components/Layout';
import {
  useWalletStore,
  chainToFrontend,
  formatETH,
  formatAddress,
  isBlockchainConfigured,
  getStatusLabel,
  ROUTE_PATHS,
  type Campaign,
} from '@/lib/index';
import {
  fetchAllCampaigns,
  fetchAllProposals,
  isGovernanceConfigured,
  isMilestoneEscrowConfigured,
  txApproveCampaign,
  txCreateMilestone,
  txCreateProposal,
  txRejectCampaign,
  formatError,
} from '@/lib/blockchain';
import { printAdminCampaignReport } from '@/lib/reportGenerator';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

export default function AdminDashboard() {
  const { role, isConnected } = useWalletStore();
  const queryClient = useQueryClient();
  const chainEnabled = isBlockchainConfigured();
  const governanceEnabled = isGovernanceConfigured();
  const milestoneEnabled = isMilestoneEscrowConfigured();
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [txPending, setTxPending] = useState<number | null>(null);
  const [proposalCampaignId, setProposalCampaignId] = useState('');
  const [proposalTitle, setProposalTitle] = useState('');
  const [proposalDescription, setProposalDescription] = useState('');
  const [proposalVotingDays, setProposalVotingDays] = useState('3');
  const [proposalQuorumEth, setProposalQuorumEth] = useState('1');
  const [milestoneCampaignId, setMilestoneCampaignId] = useState('');
  const [milestoneTitle, setMilestoneTitle] = useState('');
  const [milestoneDetails, setMilestoneDetails] = useState('');
  const [milestoneAmountEth, setMilestoneAmountEth] = useState('');
  const [metaPending, setMetaPending] = useState<'proposal' | 'milestone' | null>(null);

  const { data: chainCampaigns, isLoading, error, refetch } = useQuery({
    queryKey: ['campaigns'],
    queryFn: fetchAllCampaigns,
    enabled: chainEnabled && isConnected && role === 'admin',
    staleTime: 10_000,
  });

  const { data: proposals = [] } = useQuery({
    queryKey: ['governance-proposals'],
    queryFn: fetchAllProposals,
    enabled: governanceEnabled && isConnected && role === 'admin',
    staleTime: 10_000,
  });

  if (!isConnected || role !== 'admin') {
    return <Navigate to={ROUTE_PATHS.HOME} replace />;
  }

  const allCampaigns: Campaign[] = (chainCampaigns ?? []).map(chainToFrontend);
  const pendingCampaigns = (chainCampaigns ?? []).filter(c => c.status === 'pending');
  const approvedCampaigns = allCampaigns.filter(c => c.status !== 'pending' && c.status !== 'rejected');
  const successfulCampaigns = allCampaigns.filter(c => c.status === 'successful');

  function handlePrintReport() {
    const opened = printAdminCampaignReport(allCampaigns);
    if (!opened) {
      toast.error('Allow pop-ups in your browser to print the PDF report.');
      return;
    }
    toast.success('Print dialog opened. Choose "Save as PDF" to export the report.');
  }

  async function handleApprove(id: number) {
    setTxPending(id);
    try {
      await txApproveCampaign(id);
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      toast.success(`Campaign #${id} approved.`);
    } catch (err) {
      toast.error(formatError(err));
    } finally {
      setTxPending(null);
    }
  }

  async function handleReject(id: number) {
    if (!rejectReason.trim()) {
      toast.error('Please enter a rejection reason.');
      return;
    }
    setTxPending(id);
    try {
      await txRejectCampaign(id, rejectReason.trim());
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      toast.success(`Campaign #${id} rejected.`);
      setRejectingId(null);
      setRejectReason('');
    } catch (err) {
      toast.error(formatError(err));
    } finally {
      setTxPending(null);
    }
  }

  async function handleCreateProposal() {
    if (!proposalCampaignId || !proposalTitle.trim() || !proposalDescription.trim() || !proposalQuorumEth) {
      toast.error('Fill in all proposal fields.');
      return;
    }

    setMetaPending('proposal');
    try {
      await txCreateProposal(
        Number(proposalCampaignId),
        proposalTitle.trim(),
        proposalDescription.trim(),
        Math.max(1, Number(proposalVotingDays || '1')) * 24 * 60 * 60,
        proposalQuorumEth,
      );
      await queryClient.invalidateQueries({ queryKey: ['governance-proposals'] });
      toast.success('Governance proposal created.');
      setProposalCampaignId('');
      setProposalTitle('');
      setProposalDescription('');
      setProposalVotingDays('3');
      setProposalQuorumEth('1');
    } catch (err) {
      toast.error(formatError(err));
    } finally {
      setMetaPending(null);
    }
  }

  async function handleCreateMilestone() {
    if (!milestoneCampaignId || !milestoneTitle.trim() || !milestoneDetails.trim() || !milestoneAmountEth) {
      toast.error('Fill in all milestone fields.');
      return;
    }

    setMetaPending('milestone');
    try {
      await txCreateMilestone(
        Number(milestoneCampaignId),
        milestoneTitle.trim(),
        milestoneDetails.trim(),
        milestoneAmountEth,
      );
      await queryClient.invalidateQueries({ queryKey: ['milestones', milestoneCampaignId] });
      toast.success('Milestone created.');
      setMilestoneCampaignId('');
      setMilestoneTitle('');
      setMilestoneDetails('');
      setMilestoneAmountEth('');
    } catch (err) {
      toast.error(formatError(err));
    } finally {
      setMetaPending(null);
    }
  }

  return (
    <Layout>
      <div className="container mx-auto px-4 py-12 max-w-5xl">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>

          <div className="flex flex-col gap-4 mb-8 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-yellow-500 to-orange-500 flex items-center justify-center">
                <ShieldCheck className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-4xl font-bold bg-gradient-to-r from-yellow-400 to-orange-400 bg-clip-text text-transparent">
                  Admin Dashboard
                </h1>
                <p className="text-muted-foreground text-sm">Review and approve campaign submissions</p>
              </div>
            </div>
            <Button
              onClick={handlePrintReport}
              variant="outline"
              disabled={!chainEnabled || isLoading || !!error}
              className="border-yellow-500/40 text-yellow-400 hover:bg-yellow-500/10 hover:text-yellow-300"
            >
              <FileText className="w-4 h-4 mr-2" />
              Print PDF Report
            </Button>
          </div>

          {!chainEnabled && (
            <Card className="border-yellow-500/30 bg-yellow-500/5 mb-8">
              <CardContent className="flex items-center gap-3 p-4">
                <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0" />
                <p className="text-sm text-yellow-400">
                  Blockchain not configured. Deploy contracts and set addresses in <code className="text-xs bg-muted/50 px-1 rounded">.env</code> to use admin functions.
                </p>
              </CardContent>
            </Card>
          )}

          {isLoading && (
            <div className="flex items-center justify-center py-24 gap-3">
              <Loader2 className="w-8 h-8 text-accent animate-spin" />
              <span className="text-muted-foreground">Loading campaigns from Ganache…</span>
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <AlertCircle className="w-12 h-12 text-destructive" />
              <p className="text-destructive text-center">Could not load campaigns from Ganache.</p>
              <Button variant="outline" onClick={() => refetch()}>Retry</Button>
            </div>
          )}

          {!isLoading && !error && chainEnabled && (
            <>
              <div className="flex items-center gap-2 mb-6">
                <Clock className="w-4 h-4 text-yellow-400" />
                <span className="text-muted-foreground text-sm">
                  <span className="text-foreground font-semibold">{pendingCampaigns.length}</span> campaign{pendingCampaigns.length !== 1 ? 's' : ''} awaiting review
                </span>
              </div>

              {pendingCampaigns.length === 0 ? (
                <Card className="border-border/50 bg-card/50">
                  <CardContent className="flex flex-col items-center justify-center py-16">
                    <CheckCircle className="w-16 h-16 text-chart-3 mb-4" />
                    <h3 className="text-xl font-semibold mb-2">All caught up!</h3>
                    <p className="text-muted-foreground text-center">No campaigns pending review.</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-6">
                  {pendingCampaigns.map((chainCampaign, index) => {
                    const campaign = chainToFrontend(chainCampaign);
                    const isRejectingThis = rejectingId === chainCampaign.id;
                    const isPending = txPending === chainCampaign.id;

                    return (
                      <motion.div
                        key={chainCampaign.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: index * 0.1 }}
                      >
                        <Card className="border-yellow-500/30 bg-card/60 backdrop-blur-sm">
                          <CardContent className="p-6 space-y-4">
                            <div className="flex items-start justify-between gap-4">
                              <div>
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-xs font-mono text-muted-foreground">#{chainCampaign.id}</span>
                                  <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/40">Pending Approval</Badge>
                                </div>
                                <h3 className="text-xl font-semibold break-all">{campaign.title}</h3>
                                <p className="text-sm text-muted-foreground font-mono mt-1">
                                  Creator: {formatAddress(campaign.creator)}
                                </p>
                              </div>
                              <div className="text-right flex-shrink-0">
                                <p className="text-sm text-muted-foreground">Goal</p>
                                <p className="font-mono font-semibold">{formatETH(campaign.goal)}</p>
                                <p className="text-xs text-muted-foreground mt-1">
                                  Deadline: {new Date(campaign.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                </p>
                              </div>
                            </div>

                            <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3 break-all">
                              {campaign.description}
                            </p>

                            {isRejectingThis ? (
                              <div className="space-y-3 pt-2 border-t border-border/50">
                                <Textarea
                                  placeholder="Reason for rejection (required)..."
                                  value={rejectReason}
                                  onChange={e => setRejectReason(e.target.value)}
                                  rows={3}
                                  className="bg-background/50 border-border/50 focus:border-destructive/60 transition-colors resize-none"
                                />
                                <div className="flex gap-3">
                                  <Button
                                    onClick={() => handleReject(chainCampaign.id)}
                                    disabled={isPending}
                                    variant="destructive"
                                    className="flex-1"
                                  >
                                    {isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <XCircle className="w-4 h-4 mr-2" />}
                                    Confirm Reject
                                  </Button>
                                  <Button
                                    onClick={() => { setRejectingId(null); setRejectReason(''); }}
                                    variant="outline"
                                  >
                                    Cancel
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex gap-3 pt-2 border-t border-border/50">
                                <Button
                                  onClick={() => handleApprove(chainCampaign.id)}
                                  disabled={isPending}
                                  className="bg-chart-3 hover:bg-chart-3/90 text-white flex-1"
                                >
                                  {isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-2" />}
                                  Approve
                                </Button>
                                <Button
                                  onClick={() => { setRejectingId(chainCampaign.id); setRejectReason(''); }}
                                  disabled={isPending}
                                  variant="outline"
                                  className="border-destructive/50 text-destructive hover:bg-destructive/10 flex-1"
                                >
                                  <XCircle className="w-4 h-4 mr-2" />
                                  Reject
                                </Button>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      </motion.div>
                    );
                  })}
                </div>
              )}

              <div className="grid gap-6 mt-10 lg:grid-cols-2">
                <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
                  <CardContent className="p-6 space-y-4">
                    <div className="flex items-center gap-3">
                      <Vote className="w-5 h-5 text-primary" />
                      <div>
                        <h2 className="text-xl font-semibold">Create Governance Proposal</h2>
                        <p className="text-sm text-muted-foreground">Admin-only proposal creation for contributor voting.</p>
                      </div>
                    </div>

                    {!governanceEnabled ? (
                      <p className="text-sm text-muted-foreground">Set <code className="text-xs bg-muted/50 px-1 rounded">VITE_GOVERNANCE_VOTING_ADDRESS</code> to enable this section.</p>
                    ) : (
                      <>
                        <Input placeholder="Campaign ID" value={proposalCampaignId} onChange={e => setProposalCampaignId(e.target.value)} />
                        <Input placeholder="Proposal title" value={proposalTitle} onChange={e => setProposalTitle(e.target.value)} />
                        <Textarea placeholder="Proposal description" value={proposalDescription} onChange={e => setProposalDescription(e.target.value)} rows={3} />
                        <div className="grid grid-cols-2 gap-3">
                          <Input placeholder="Voting days" type="number" min="1" value={proposalVotingDays} onChange={e => setProposalVotingDays(e.target.value)} />
                          <Input placeholder="Quorum (ETH)" type="number" min="0" step="0.001" value={proposalQuorumEth} onChange={e => setProposalQuorumEth(e.target.value)} />
                        </div>
                        <Button onClick={handleCreateProposal} disabled={metaPending === 'proposal'} className="w-full">
                          {metaPending === 'proposal' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Vote className="w-4 h-4 mr-2" />}
                          Create Proposal
                        </Button>
                        <div className="space-y-2 pt-2 border-t border-border/50">
                          <p className="text-xs uppercase tracking-wide text-muted-foreground">Eligible campaigns</p>
                          {approvedCampaigns.slice(0, 4).map(campaign => (
                            <div key={campaign.id} className="flex items-center justify-between text-sm">
                              <span>#{campaign.id} {campaign.title}</span>
                              <Badge variant="outline">{getStatusLabel(campaign.status)}</Badge>
                            </div>
                          ))}
                          {proposals.length > 0 && (
                            <p className="text-xs text-muted-foreground pt-2">{proposals.length} proposal{proposals.length === 1 ? '' : 's'} created so far.</p>
                          )}
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>

                <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
                  <CardContent className="p-6 space-y-4">
                    <div className="flex items-center gap-3">
                      <Landmark className="w-5 h-5 text-chart-3" />
                      <div>
                        <h2 className="text-xl font-semibold">Create Milestone</h2>
                        <p className="text-sm text-muted-foreground">Reserve escrow-backed releases for successful campaigns.</p>
                      </div>
                    </div>

                    {!milestoneEnabled ? (
                      <p className="text-sm text-muted-foreground">Set <code className="text-xs bg-muted/50 px-1 rounded">VITE_MILESTONE_ESCROW_ADDRESS</code> to enable this section.</p>
                    ) : (
                      <>
                        <Input placeholder="Campaign ID" value={milestoneCampaignId} onChange={e => setMilestoneCampaignId(e.target.value)} />
                        <Input placeholder="Milestone title" value={milestoneTitle} onChange={e => setMilestoneTitle(e.target.value)} />
                        <Textarea placeholder="Milestone details" value={milestoneDetails} onChange={e => setMilestoneDetails(e.target.value)} rows={3} />
                        <Input placeholder="Release amount (ETH)" type="number" min="0" step="0.001" value={milestoneAmountEth} onChange={e => setMilestoneAmountEth(e.target.value)} />
                        <Button onClick={handleCreateMilestone} disabled={metaPending === 'milestone'} className="w-full bg-chart-3 hover:bg-chart-3/90 text-white">
                          {metaPending === 'milestone' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Landmark className="w-4 h-4 mr-2" />}
                          Create Milestone
                        </Button>
                        <div className="space-y-2 pt-2 border-t border-border/50">
                          <p className="text-xs uppercase tracking-wide text-muted-foreground">Successful campaigns</p>
                          {successfulCampaigns.slice(0, 4).map(campaign => (
                            <div key={campaign.id} className="flex items-center justify-between text-sm">
                              <span>#{campaign.id} {campaign.title}</span>
                              <span className="font-mono">{formatETH(campaign.current)}</span>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </motion.div>
      </div>
    </Layout>
  );
}
