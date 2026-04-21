import { Layout } from '@/components/Layout';
import { CampaignCard } from '@/components/CampaignCard';
import {
  useWalletStore, MOCK_CAMPAIGNS, MOCK_CONTRIBUTIONS,
  formatETH, formatAddress, getStatusLabel, getStatusColor,
  chainToFrontend, isBlockchainConfigured,
  type Campaign, type Contribution,
} from '@/lib/index';
import {
  fetchAllCampaigns, fetchUserContributedIds, queryContribution,
  queryLumiBalance, weiToEth, formatError,
} from '@/lib/blockchain';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Wallet, Film, TrendingUp, Calendar, Coins, Loader2, AlertCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { formatEther } from 'ethers';

export default function Dashboard() {
  const { isConnected, address, connect } = useWalletStore();
  const chainEnabled = isBlockchainConfigured();

  // ── Chain data ────────────────────────────────────────────────────
  const { data: allChainCampaigns, isLoading: campaignsLoading } = useQuery({
    queryKey: ['campaigns'],
    queryFn: fetchAllCampaigns,
    enabled: chainEnabled && isConnected,
    staleTime: 15_000,
  });

  const { data: contributedIds = [], isLoading: idsLoading } = useQuery({
    queryKey: ['contributedIds', address],
    queryFn: () => fetchUserContributedIds(address!),
    enabled: chainEnabled && !!address,
    staleTime: 15_000,
  });

  const { data: lumiWei = 0n } = useQuery({
    queryKey: ['lumiBalance', address],
    queryFn: () => queryLumiBalance(address!),
    enabled: chainEnabled && !!address,
    staleTime: 30_000,
  });

  // ── Derived data ──────────────────────────────────────────────────
  const userCampaigns: Campaign[] = chainEnabled
    ? (allChainCampaigns ?? [])
        .filter(c => c.creator.toLowerCase() === (address ?? '').toLowerCase())
        .map(chainToFrontend)
    : MOCK_CAMPAIGNS.filter(c => c.creator === address);

  const contributedCampaigns: Campaign[] = chainEnabled
    ? (allChainCampaigns ?? [])
        .filter(c => contributedIds.includes(c.id))
        .map(chainToFrontend)
    : MOCK_CAMPAIGNS.filter(c => MOCK_CONTRIBUTIONS.some(co => co.campaignId === c.id));

  const isLoading = campaignsLoading || idsLoading;
  const lumiBalance = parseFloat(formatEther(lumiWei));

  // ── Not connected ─────────────────────────────────────────────────
  if (!isConnected) {
    return (
      <Layout>
        <div className="min-h-[80vh] flex items-center justify-center px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center max-w-md"
          >
            <div className="mb-8 flex justify-center">
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                <Wallet className="w-12 h-12 text-primary-foreground" />
              </div>
            </div>
            <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              Connect Your Wallet
            </h1>
            <p className="text-muted-foreground mb-8 text-lg">
              Connect your MetaMask wallet to view your campaigns and contributions.
            </p>
            <Button
              size="lg"
              onClick={connect}
              className="bg-gradient-to-r from-primary to-accent hover:opacity-90 transition-opacity"
            >
              <Wallet className="mr-2 h-5 w-5" />
              Connect Wallet
            </Button>
          </motion.div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container mx-auto px-4 py-12 max-w-7xl">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>

          {/* Header */}
          <div className="mb-8">
            <div className="flex flex-wrap items-center gap-3 mb-2">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                <Wallet className="w-6 h-6 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                  Dashboard
                </h1>
                <p className="text-muted-foreground font-mono text-sm">{formatAddress(address || '')}</p>
              </div>
              {chainEnabled && lumiBalance > 0 && (
                <div className="ml-auto flex items-center gap-2 bg-chart-3/10 border border-chart-3/30 rounded-lg px-4 py-2">
                  <Coins className="w-4 h-4 text-chart-3" />
                  <span className="font-mono font-semibold text-chart-3">{lumiBalance.toFixed(2)} LUMI</span>
                </div>
              )}
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-24 gap-3">
              <Loader2 className="w-8 h-8 text-accent animate-spin" />
              <span className="text-muted-foreground">Loading from Ganache…</span>
            </div>
          ) : (
            <Tabs defaultValue="campaigns" className="w-full">
              <TabsList className="grid w-full max-w-md grid-cols-2 mb-8">
                <TabsTrigger value="campaigns" className="flex items-center gap-2">
                  <Film className="w-4 h-4" />
                  My Campaigns
                </TabsTrigger>
                <TabsTrigger value="contributions" className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  My Contributions
                </TabsTrigger>
              </TabsList>

              {/* Campaigns tab */}
              <TabsContent value="campaigns">
                {userCampaigns.length === 0 ? (
                  <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
                    <CardContent className="flex flex-col items-center justify-center py-16">
                      <div className="w-20 h-20 rounded-full bg-muted/30 flex items-center justify-center mb-6">
                        <Film className="w-10 h-10 text-muted-foreground" />
                      </div>
                      <h3 className="text-2xl font-semibold mb-2">No Campaigns Yet</h3>
                      <p className="text-muted-foreground text-center max-w-md mb-6">
                        You haven't created any campaigns yet. Launch your first film campaign.
                      </p>
                      <Button
                        onClick={() => window.location.assign('#/create')}
                        className="bg-gradient-to-r from-primary to-accent hover:opacity-90 transition-opacity"
                      >
                        Create Campaign
                      </Button>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-6">
                    {userCampaigns.map((campaign, index) => (
                      <motion.div key={campaign.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: index * 0.1 }}>
                        <Card className="border-border/50 bg-card/50 backdrop-blur-sm hover:border-primary/50 transition-colors">
                          <CardContent className="p-6">
                            <div className="flex flex-col md:flex-row gap-6">
                              <div className="w-full md:w-48 h-32 rounded-lg overflow-hidden flex-shrink-0">
                                <img src={campaign.image} alt={campaign.title} className="w-full h-full object-cover" />
                              </div>
                              <div className="flex-1 space-y-4">
                                <div className="flex items-start justify-between gap-4">
                                  <div>
                                    <h3 className="text-2xl font-semibold mb-2">{campaign.title}</h3>
                                    <p className="text-muted-foreground line-clamp-2">{campaign.shortDescription}</p>
                                  </div>
                                  <Badge className={getStatusColor(campaign.status)}>{getStatusLabel(campaign.status)}</Badge>
                                </div>
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between text-sm">
                                    <span className="text-muted-foreground">Funding Progress</span>
                                    <span className="font-mono font-semibold">{formatETH(campaign.current)} / {formatETH(campaign.goal)}</span>
                                  </div>
                                  <Progress value={(campaign.current / campaign.goal) * 100} className="h-2" />
                                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                                    <span>{Math.round((campaign.current / campaign.goal) * 100)}% funded</span>
                                    <span className="flex items-center gap-1">
                                      <Calendar className="w-3 h-3" />
                                      {new Date(campaign.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                    </span>
                                  </div>
                                </div>
                                <Button variant="outline" size="sm" onClick={() => window.location.assign(`#/campaign/${campaign.id}`)}>
                                  View Details
                                </Button>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </motion.div>
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* Contributions tab */}
              <TabsContent value="contributions">
                {contributedCampaigns.length === 0 ? (
                  <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
                    <CardContent className="flex flex-col items-center justify-center py-16">
                      <div className="w-20 h-20 rounded-full bg-muted/30 flex items-center justify-center mb-6">
                        <TrendingUp className="w-10 h-10 text-muted-foreground" />
                      </div>
                      <h3 className="text-2xl font-semibold mb-2">No Contributions Yet</h3>
                      <p className="text-muted-foreground text-center max-w-md mb-6">
                        You haven't supported any campaigns yet. Explore active campaigns.
                      </p>
                      <Button onClick={() => window.location.assign('#/explore')} className="bg-gradient-to-r from-primary to-accent hover:opacity-90 transition-opacity">
                        Explore Campaigns
                      </Button>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-4">
                    {contributedCampaigns.map((campaign, index) => (
                      <motion.div key={campaign.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: index * 0.1 }}>
                        <Card className="border-border/50 bg-card/50 backdrop-blur-sm hover:border-primary/50 transition-colors">
                          <CardContent className="p-6">
                            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                              <div className="flex-1">
                                <h3 className="text-xl font-semibold mb-2">{campaign.title}</h3>
                                <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                                  <span className="flex items-center gap-1">
                                    <Calendar className="w-4 h-4" />
                                    Deadline: {new Date(campaign.deadline).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                                  </span>
                                  <Badge className={getStatusColor(campaign.status)}>{getStatusLabel(campaign.status)}</Badge>
                                </div>
                              </div>
                              <div className="flex items-center gap-4">
                                <Button variant="outline" size="sm" onClick={() => window.location.assign(`#/campaign/${campaign.id}`)}>
                                  View Campaign
                                </Button>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </motion.div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}
        </motion.div>
      </div>
    </Layout>
  );
}
