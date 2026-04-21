import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ShieldCheck, CheckCircle, XCircle, Loader2, Clock, AlertCircle, FileText } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Layout } from '@/components/Layout';
import {
  useWalletStore,
  chainToFrontend,
  formatETH,
  formatAddress,
  isBlockchainConfigured,
  ROUTE_PATHS,
  type Campaign,
} from '@/lib/index';
import {
  fetchAllCampaigns,
  txApproveCampaign,
  txRejectCampaign,
  formatError,
} from '@/lib/blockchain';
import { printAdminCampaignReport } from '@/lib/reportGenerator';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';

export default function AdminDashboard() {
  const { role, isConnected } = useWalletStore();
  const queryClient = useQueryClient();
  const chainEnabled = isBlockchainConfigured();
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [txPending, setTxPending] = useState<number | null>(null);

  const { data: chainCampaigns, isLoading, error, refetch } = useQuery({
    queryKey: ['campaigns'],
    queryFn: fetchAllCampaigns,
    enabled: chainEnabled && isConnected && role === 'admin',
    staleTime: 10_000,
  });

  if (!isConnected || role !== 'admin') {
    return <Navigate to={ROUTE_PATHS.HOME} replace />;
  }

  const allCampaigns: Campaign[] = (chainCampaigns ?? []).map(chainToFrontend);
  const pendingCampaigns = (chainCampaigns ?? []).filter(c => c.status === 'pending');

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
                                <h3 className="text-xl font-semibold">{campaign.title}</h3>
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

                            <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">
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
            </>
          )}
        </motion.div>
      </div>
    </Layout>
  );
}
