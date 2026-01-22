'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  usePendingBrokerApplications,
  useApproveBrokerApplication,
  useRejectBrokerApplication,
  useApprovedBrokers,
  useSetUserRole,
  useUpdateBroker,
  useAdminPendingDeals,
  useAdminSetDealLive,
  useAdminRejectDeal,
  type BrokerProfile,
  type BrokerUpdateData,
} from '@/hooks/use-broker';
import type { Property } from '@/types';
import { toast } from 'sonner';
import {
  Shield,
  CheckCircle2,
  XCircle,
  Clock,
  Users,
  Building2,
  FileText,
  Calendar,
  Phone,
  Mail,
  MapPin,
  Eye,
  Map,
  List,
  Pencil,
  X,
} from 'lucide-react';

// All US states for multi-select
const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL',
  'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME',
  'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH',
  'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI',
  'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
];

const STATE_NAMES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'Washington DC', FL: 'Florida',
  GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana',
  IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine',
  MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi',
  MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire',
  NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota',
  OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island',
  SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah',
  VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin',
  WY: 'Wyoming',
};
import { USBrokerMap } from '@/components/broker/USBrokerMap';

export default function BrokerAdminPage() {
  const { data: pendingApplications, isLoading: pendingLoading, error: pendingError, refetch: refetchPending } = usePendingBrokerApplications();
  const { data: approvedBrokers, isLoading: brokersLoading, error: brokersError, refetch: refetchBrokers } = useApprovedBrokers();
  const { data: pendingDeals, isLoading: dealsLoading, refetch: refetchDeals } = useAdminPendingDeals();
  const approveApplication = useApproveBrokerApplication();
  const rejectApplication = useRejectBrokerApplication();
  const setUserRole = useSetUserRole();
  const updateBroker = useUpdateBroker();
  const setDealLive = useAdminSetDealLive();
  const rejectDeal = useAdminRejectDeal();

  // Deal rejection dialog state
  const [rejectDealDialogOpen, setRejectDealDialogOpen] = useState(false);
  const [dealToReject, setDealToReject] = useState<Property | null>(null);
  const [dealRejectionReason, setDealRejectionReason] = useState('');

  // Deal detail dialog state
  const [dealDetailDialogOpen, setDealDetailDialogOpen] = useState(false);
  const [selectedDeal, setSelectedDeal] = useState<Property | null>(null);

  // Check for admin access error
  const hasAdminError = pendingError || brokersError;

  const handleBecomeAdmin = async () => {
    try {
      await setUserRole.mutateAsync('admin');
      toast.success('You are now an admin! Refreshing data...');
      // Refetch the data after becoming admin
      await Promise.all([refetchPending(), refetchBrokers(), refetchDeals()]);
    } catch (error) {
      toast.error((error as Error).message || 'Failed to set admin role');
    }
  };

  const handleApproveDeal = async (propertyId: string | number) => {
    try {
      await setDealLive.mutateAsync(propertyId);
      toast.success('Deal approved and set to live!');
    } catch (error) {
      toast.error((error as Error).message || 'Failed to approve deal');
    }
  };

  const openRejectDealDialog = (deal: Property) => {
    setDealToReject(deal);
    setDealRejectionReason('');
    setRejectDealDialogOpen(true);
  };

  const handleRejectDeal = async () => {
    if (!dealToReject || !dealRejectionReason.trim()) {
      toast.error('Please provide a rejection reason');
      return;
    }

    try {
      await rejectDeal.mutateAsync({
        propertyId: dealToReject.id,
        reason: dealRejectionReason,
      });
      toast.success('Deal rejected');
      setRejectDealDialogOpen(false);
      setDealToReject(null);
      setDealRejectionReason('');
    } catch (error) {
      toast.error((error as Error).message || 'Failed to reject deal');
    }
  };

  const openDealDetail = (deal: Property) => {
    setSelectedDeal(deal);
    setDealDetailDialogOpen(true);
  };

  const getAddress = (deal: Property) => {
    return typeof deal.address === 'string'
      ? deal.address
      : `${deal.address?.houseNumber || ''} ${deal.address?.street || ''}`.trim() || 'No address';
  };

  const formatPrice = (price?: number) => {
    if (!price) return 'N/A';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(price);
  };

  const [selectedApplication, setSelectedApplication] = useState<BrokerProfile | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'map'>('map');

  // Edit dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingBroker, setEditingBroker] = useState<BrokerProfile | null>(null);
  const [editForm, setEditForm] = useState<BrokerUpdateData>({});
  const [selectedStates, setSelectedStates] = useState<string[]>([]);

  const openEditDialog = (broker: BrokerProfile) => {
    setEditingBroker(broker);
    setEditForm({
      licenseNumber: broker.licenseNumber,
      licenseState: broker.licenseState,
      brokerageCompany: broker.brokerageCompany,
      brokerageAddress: broker.brokerageAddress || '',
      brokeragePhone: broker.brokeragePhone || '',
      brokerageEmail: broker.brokerageEmail || '',
      eoInsurancePolicy: broker.eoInsurancePolicy || '',
    });
    // Initialize selected states from broker's licensedStates or just the primary state
    const states = broker.licensedStates?.length ? broker.licensedStates : [broker.licenseState];
    setSelectedStates(states);
    setEditDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editingBroker) return;

    try {
      await updateBroker.mutateAsync({
        brokerId: editingBroker.id,
        data: {
          ...editForm,
          licensedStates: selectedStates,
        },
      });
      toast.success(`Updated ${editingBroker.brokerageCompany}`);
      setEditDialogOpen(false);
      setEditingBroker(null);
    } catch (error) {
      toast.error((error as Error).message || 'Failed to update broker');
    }
  };

  const toggleState = (state: string) => {
    setSelectedStates((prev) =>
      prev.includes(state) ? prev.filter((s) => s !== state) : [...prev, state]
    );
  };

  const openDetailDialog = (application: BrokerProfile) => {
    setSelectedApplication(application);
    setDetailDialogOpen(true);
  };

  const handleApprove = async (application: BrokerProfile) => {
    try {
      await approveApplication.mutateAsync(application.id);
      toast.success(`Approved ${application.brokerageCompany}`);
    } catch (error) {
      toast.error((error as Error).message || 'Failed to approve application');
    }
  };

  const handleReject = async () => {
    if (!selectedApplication || !rejectionReason.trim()) {
      toast.error('Please provide a rejection reason');
      return;
    }

    try {
      await rejectApplication.mutateAsync({
        applicationId: selectedApplication.id,
        reason: rejectionReason,
      });
      toast.success(`Rejected ${selectedApplication.brokerageCompany}`);
      setRejectDialogOpen(false);
      setSelectedApplication(null);
      setRejectionReason('');
    } catch (error) {
      toast.error((error as Error).message || 'Failed to reject application');
    }
  };

  const openRejectDialog = (application: BrokerProfile) => {
    setSelectedApplication(application);
    setRejectDialogOpen(true);
  };

  return (
    <div className="container mx-auto py-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-accent-500/10 rounded-lg">
            <Shield className="h-6 w-6 text-accent-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Broker Administration</h1>
            <p className="text-muted-foreground">Manage broker applications and approvals</p>
          </div>
        </div>
        <Button
          variant="outline"
          className="border-accent-500 text-accent-500 hover:bg-accent-500/10"
          onClick={() => window.open('/broker-apply', '_blank')}
        >
          <FileText className="h-4 w-4 mr-2" />
          Broker Application Page
        </Button>
      </div>

      {/* Admin Access Error */}
      {hasAdminError && (
        <Card className="bg-red-950/50 border-red-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 text-red-400">
                <XCircle className="h-5 w-5" />
                <div>
                  <p className="font-medium">Admin Access Required</p>
                  <p className="text-sm text-red-400/80">
                    You need admin privileges to view broker applications.
                  </p>
                </div>
              </div>
              <Button
                onClick={handleBecomeAdmin}
                disabled={setUserRole.isPending}
                className="bg-accent-500 hover:bg-accent-600"
              >
                {setUserRole.isPending ? 'Setting...' : 'Become Admin (Dev Only)'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-card border">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-muted-foreground text-sm">Pending Deals</p>
                <p className="text-2xl font-bold text-amber-500">
                  {dealsLoading ? '...' : pendingDeals?.length || 0}
                </p>
              </div>
              <FileText className="h-8 w-8 text-amber-500/50" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-muted-foreground text-sm">Pending Applications</p>
                <p className="text-2xl font-bold text-yellow-500">
                  {pendingLoading ? '...' : pendingApplications?.length || 0}
                </p>
              </div>
              <Clock className="h-8 w-8 text-yellow-500/50" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-muted-foreground text-sm">Approved Brokers</p>
                <p className="text-2xl font-bold text-green-500">
                  {brokersLoading ? '...' : approvedBrokers?.length || 0}
                </p>
              </div>
              <Users className="h-8 w-8 text-green-500/50" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-muted-foreground text-sm">States Covered</p>
                <p className="text-2xl font-bold text-accent-500">
                  {brokersLoading
                    ? '...'
                    : new Set(
                        approvedBrokers?.flatMap((b) =>
                          b.licensedStates?.length ? b.licensedStates : [b.licenseState]
                        ) || []
                      ).size}
                </p>
              </div>
              <Building2 className="h-8 w-8 text-accent-500/50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pending Deal Approvals */}
      <Card className="bg-card border">
        <CardHeader>
          <CardTitle className="text-foreground flex items-center gap-2">
            <FileText className="h-5 w-5 text-amber-500" />
            Pending Deal Approvals
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Approve deals to make them live on the marketplace
          </CardDescription>
        </CardHeader>
        <CardContent>
          {dealsLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent-500" />
            </div>
          ) : !pendingDeals?.length ? (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle2 className="h-12 w-12 mx-auto mb-2 text-green-500/50" />
              <p>No deals pending approval</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border">
                  <TableHead className="text-muted-foreground">Address</TableHead>
                  <TableHead className="text-muted-foreground">City</TableHead>
                  <TableHead className="text-muted-foreground">State</TableHead>
                  <TableHead className="text-muted-foreground">Price</TableHead>
                  <TableHead className="text-muted-foreground">Type</TableHead>
                  <TableHead className="text-muted-foreground">Submitted</TableHead>
                  <TableHead className="text-muted-foreground text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingDeals.map((deal: Property) => (
                  <TableRow
                    key={deal.id}
                    className="border hover:bg-secondary/50 cursor-pointer"
                    onClick={() => openDealDetail(deal)}
                  >
                    <TableCell className="text-foreground font-medium">
                      {getAddress(deal)}
                    </TableCell>
                    <TableCell className="text-foreground">{deal.city || 'N/A'}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="border-accent-500 text-accent-500">
                        {deal.state || 'N/A'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-foreground">{formatPrice(deal.askingPrice)}</TableCell>
                    <TableCell className="text-foreground">{deal.propertyType || 'N/A'}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {deal.createdAt ? new Date(deal.createdAt).toLocaleDateString() : 'N/A'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-2 justify-end" onClick={(e) => e.stopPropagation()}>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border text-foreground hover:bg-zinc-700/50"
                          onClick={() => openDealDetail(deal)}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          View
                        </Button>
                        <Button
                          size="sm"
                          className="bg-green-600 hover:bg-green-700"
                          onClick={() => handleApproveDeal(deal.id)}
                          disabled={setDealLive.isPending || rejectDeal.isPending}
                        >
                          <CheckCircle2 className="h-4 w-4 mr-1" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-red-600 text-red-500 hover:bg-red-600/10"
                          onClick={() => openRejectDealDialog(deal)}
                          disabled={setDealLive.isPending || rejectDeal.isPending}
                        >
                          <XCircle className="h-4 w-4 mr-1" />
                          Reject
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Approved Brokers */}
      <Card className="bg-card border">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-foreground flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                Approved Brokers
              </CardTitle>
              <CardDescription className="text-muted-foreground">
                Active brokers who can review and approve deals
              </CardDescription>
            </div>
            {/* View Toggle */}
            <div className="flex items-center gap-1 bg-secondary rounded-lg p-1">
              <Button
                size="sm"
                variant={viewMode === 'list' ? 'default' : 'ghost'}
                className={viewMode === 'list' ? 'bg-accent-500 hover:bg-accent-600' : 'text-muted-foreground hover:text-white'}
                onClick={() => setViewMode('list')}
              >
                <List className="h-4 w-4 mr-1" />
                List
              </Button>
              <Button
                size="sm"
                variant={viewMode === 'map' ? 'default' : 'ghost'}
                className={viewMode === 'map' ? 'bg-accent-500 hover:bg-accent-600' : 'text-muted-foreground hover:text-white'}
                onClick={() => setViewMode('map')}
              >
                <Map className="h-4 w-4 mr-1" />
                Map
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {brokersLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent-500" />
            </div>
          ) : viewMode === 'map' ? (
            /* Map View */
            <USBrokerMap approvedBrokers={approvedBrokers || []} />
          ) : !approvedBrokers?.length ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-2 text-zinc-700" />
              <p>No approved brokers yet</p>
            </div>
          ) : (
            /* List View */
            <Table>
              <TableHeader>
                <TableRow className="border">
                  <TableHead className="text-muted-foreground">Brokerage</TableHead>
                  <TableHead className="text-muted-foreground">License</TableHead>
                  <TableHead className="text-muted-foreground">States</TableHead>
                  <TableHead className="text-muted-foreground">Active Deals</TableHead>
                  <TableHead className="text-muted-foreground">License Expires</TableHead>
                  <TableHead className="text-muted-foreground">Status</TableHead>
                  <TableHead className="text-muted-foreground text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {approvedBrokers.map((broker) => {
                  const states = broker.licensedStates?.length ? broker.licensedStates : [broker.licenseState];
                  return (
                    <TableRow
                      key={broker.id}
                      className="border cursor-pointer hover:bg-secondary/50"
                      onClick={() => openDetailDialog(broker)}
                    >
                      <TableCell>
                        <div>
                          <p className="text-foreground font-medium">{broker.brokerageCompany}</p>
                          {broker.brokeragePhone && (
                            <p className="text-muted-foreground text-sm">{broker.brokeragePhone}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-foreground">{broker.licenseNumber}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {states.slice(0, 3).map((state) => (
                            <Badge key={state} variant="outline" className="border-accent-500 text-accent-500">
                              {state}
                            </Badge>
                          ))}
                          {states.length > 3 && (
                            <Badge variant="outline" className="border text-muted-foreground">
                              +{states.length - 3}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-foreground">{broker.activeDealsCount || 0}</TableCell>
                      <TableCell className="text-foreground">
                        {new Date(broker.licenseExpirationDate).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <Badge className="bg-green-500/10 text-green-500 border-green-500/20">
                          Active
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          className="border text-foreground hover:bg-zinc-700/50"
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditDialog(broker);
                          }}
                        >
                          <Pencil className="h-4 w-4 mr-1" />
                          Edit
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pending Applications */}
      <Card className="bg-card border">
        <CardHeader>
          <CardTitle className="text-foreground flex items-center gap-2">
            <Clock className="h-5 w-5 text-yellow-500" />
            Pending Applications
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Review and approve broker applications
          </CardDescription>
        </CardHeader>
        <CardContent>
          {pendingLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent-500" />
            </div>
          ) : !pendingApplications?.length ? (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle2 className="h-12 w-12 mx-auto mb-2 text-green-500/50" />
              <p>No pending applications</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border">
                  <TableHead className="text-muted-foreground">Brokerage</TableHead>
                  <TableHead className="text-muted-foreground">License</TableHead>
                  <TableHead className="text-muted-foreground">State</TableHead>
                  <TableHead className="text-muted-foreground">Expires</TableHead>
                  <TableHead className="text-muted-foreground">Submitted</TableHead>
                  <TableHead className="text-muted-foreground text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingApplications.map((app) => (
                  <TableRow
                    key={app.id}
                    className="border cursor-pointer hover:bg-secondary/50"
                    onClick={() => openDetailDialog(app)}
                  >
                    <TableCell>
                      <div>
                        <p className="text-foreground font-medium">{app.brokerageCompany}</p>
                        {app.brokerageEmail && (
                          <p className="text-muted-foreground text-sm">{app.brokerageEmail}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-foreground">{app.licenseNumber}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="border-accent-500 text-accent-500">
                        {app.licenseState}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-foreground">
                      {new Date(app.licenseExpirationDate).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(app.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-2 justify-end" onClick={(e) => e.stopPropagation()}>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border text-foreground hover:bg-zinc-700/50"
                          onClick={() => openDetailDialog(app)}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          View
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-green-600 text-green-500 hover:bg-green-600/10"
                          onClick={() => handleApprove(app)}
                          disabled={approveApplication.isPending}
                        >
                          <CheckCircle2 className="h-4 w-4 mr-1" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-red-600 text-red-500 hover:bg-red-600/10"
                          onClick={() => openRejectDialog(app)}
                        >
                          <XCircle className="h-4 w-4 mr-1" />
                          Reject
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Application Detail Dialog */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="bg-card border max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <Building2 className="h-5 w-5 text-accent-500" />
              Broker Application Details
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Review the complete application for {selectedApplication?.brokerageCompany}
            </DialogDescription>
          </DialogHeader>

          {selectedApplication && (
            <div className="space-y-6 py-4">
              {/* License Information */}
              <div className="space-y-3">
                <h3 className="text-foreground font-medium flex items-center gap-2 text-sm border-b border pb-2">
                  <FileText className="h-4 w-4 text-accent-500" />
                  License Information
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-muted-foreground text-xs uppercase tracking-wide">License Number</p>
                    <p className="text-foreground font-medium">{selectedApplication.licenseNumber}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs uppercase tracking-wide">License State</p>
                    <Badge variant="outline" className="border-accent-500 text-accent-500 mt-1">
                      {selectedApplication.licenseState}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs uppercase tracking-wide">Expiration Date</p>
                    <p className="text-foreground flex items-center gap-1">
                      <Calendar className="h-3 w-3 text-muted-foreground" />
                      {new Date(selectedApplication.licenseExpirationDate).toLocaleDateString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs uppercase tracking-wide">Application Status</p>
                    {selectedApplication.status === 'pending' ? (
                      <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20 mt-1">
                        <Clock className="h-3 w-3 mr-1" />
                        Pending
                      </Badge>
                    ) : selectedApplication.status === 'approved' ? (
                      <Badge className="bg-green-500/10 text-green-500 border-green-500/20 mt-1">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Approved
                      </Badge>
                    ) : selectedApplication.status === 'rejected' ? (
                      <Badge className="bg-red-500/10 text-red-500 border-red-500/20 mt-1">
                        <XCircle className="h-3 w-3 mr-1" />
                        Rejected
                      </Badge>
                    ) : (
                      <Badge className="bg-orange-500/10 text-orange-500 border-orange-500/20 mt-1">
                        {selectedApplication.status}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              {/* Brokerage Information */}
              <div className="space-y-3">
                <h3 className="text-foreground font-medium flex items-center gap-2 text-sm border-b border pb-2">
                  <Building2 className="h-4 w-4 text-accent-500" />
                  Brokerage Information
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <p className="text-muted-foreground text-xs uppercase tracking-wide">Company Name</p>
                    <p className="text-foreground font-medium text-lg">{selectedApplication.brokerageCompany}</p>
                  </div>
                  {selectedApplication.brokerageAddress && (
                    <div className="col-span-2">
                      <p className="text-muted-foreground text-xs uppercase tracking-wide">Address</p>
                      <p className="text-foreground flex items-center gap-1">
                        <MapPin className="h-3 w-3 text-muted-foreground" />
                        {selectedApplication.brokerageAddress}
                      </p>
                    </div>
                  )}
                  {selectedApplication.brokeragePhone && (
                    <div>
                      <p className="text-muted-foreground text-xs uppercase tracking-wide">Phone</p>
                      <p className="text-foreground flex items-center gap-1">
                        <Phone className="h-3 w-3 text-muted-foreground" />
                        {selectedApplication.brokeragePhone}
                      </p>
                    </div>
                  )}
                  {selectedApplication.brokerageEmail && (
                    <div>
                      <p className="text-muted-foreground text-xs uppercase tracking-wide">Email</p>
                      <p className="text-foreground flex items-center gap-1">
                        <Mail className="h-3 w-3 text-muted-foreground" />
                        {selectedApplication.brokerageEmail}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* E&O Insurance */}
              {(selectedApplication.eoInsurancePolicy || selectedApplication.eoExpirationDate) && (
                <div className="space-y-3">
                  <h3 className="text-foreground font-medium flex items-center gap-2 text-sm border-b border pb-2">
                    <Shield className="h-4 w-4 text-accent-500" />
                    E&O Insurance
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    {selectedApplication.eoInsurancePolicy && (
                      <div>
                        <p className="text-muted-foreground text-xs uppercase tracking-wide">Policy Number</p>
                        <p className="text-foreground">{selectedApplication.eoInsurancePolicy}</p>
                      </div>
                    )}
                    {selectedApplication.eoExpirationDate && (
                      <div>
                        <p className="text-muted-foreground text-xs uppercase tracking-wide">Expiration Date</p>
                        <p className="text-foreground flex items-center gap-1">
                          <Calendar className="h-3 w-3 text-muted-foreground" />
                          {new Date(selectedApplication.eoExpirationDate).toLocaleDateString()}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Submission Info */}
              <div className="bg-secondary/50 rounded-lg p-3">
                <p className="text-muted-foreground text-xs">
                  Submitted on {new Date(selectedApplication.createdAt).toLocaleDateString()} at{' '}
                  {new Date(selectedApplication.createdAt).toLocaleTimeString()}
                </p>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setDetailDialogOpen(false)}
              className="border text-foreground"
            >
              Close
            </Button>
            {selectedApplication?.status === 'pending' && (
              <>
                <Button
                  variant="outline"
                  className="border-red-600 text-red-500 hover:bg-red-600/10"
                  onClick={() => {
                    setDetailDialogOpen(false);
                    openRejectDialog(selectedApplication);
                  }}
                >
                  <XCircle className="h-4 w-4 mr-1" />
                  Reject
                </Button>
                <Button
                  className="bg-green-600 hover:bg-green-700"
                  onClick={() => {
                    handleApprove(selectedApplication);
                    setDetailDialogOpen(false);
                  }}
                  disabled={approveApplication.isPending}
                >
                  <CheckCircle2 className="h-4 w-4 mr-1" />
                  Approve
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent className="bg-card border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Reject Application</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Provide a reason for rejecting {selectedApplication?.brokerageCompany}&apos;s application.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Input
              placeholder="Rejection reason..."
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              className="bg-secondary border text-foreground"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRejectDialogOpen(false)}
              className="border text-foreground"
            >
              Cancel
            </Button>
            <Button
              onClick={handleReject}
              className="bg-red-600 hover:bg-red-700"
              disabled={rejectApplication.isPending || !rejectionReason.trim()}
            >
              {rejectApplication.isPending ? 'Rejecting...' : 'Reject Application'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Broker Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="bg-card border max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <Pencil className="h-5 w-5 text-accent-500" />
              Edit Broker
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Update broker information for {editingBroker?.brokerageCompany}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Basic Information */}
            <div className="space-y-4">
              <h3 className="text-foreground font-medium text-sm border-b border pb-2">
                Basic Information
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Brokerage Company</Label>
                  <Input
                    value={editForm.brokerageCompany || ''}
                    onChange={(e) => setEditForm({ ...editForm, brokerageCompany: e.target.value })}
                    className="bg-secondary border text-foreground"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground">License Number</Label>
                  <Input
                    value={editForm.licenseNumber || ''}
                    onChange={(e) => setEditForm({ ...editForm, licenseNumber: e.target.value })}
                    className="bg-secondary border text-foreground"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Phone</Label>
                  <Input
                    value={editForm.brokeragePhone || ''}
                    onChange={(e) => setEditForm({ ...editForm, brokeragePhone: e.target.value })}
                    className="bg-secondary border text-foreground"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Email</Label>
                  <Input
                    value={editForm.brokerageEmail || ''}
                    onChange={(e) => setEditForm({ ...editForm, brokerageEmail: e.target.value })}
                    className="bg-secondary border text-foreground"
                  />
                </div>
                <div className="col-span-2 space-y-2">
                  <Label className="text-muted-foreground">Address</Label>
                  <Input
                    value={editForm.brokerageAddress || ''}
                    onChange={(e) => setEditForm({ ...editForm, brokerageAddress: e.target.value })}
                    className="bg-secondary border text-foreground"
                  />
                </div>
              </div>
            </div>

            {/* Licensed States */}
            <div className="space-y-4">
              <h3 className="text-foreground font-medium text-sm border-b border pb-2 flex items-center justify-between">
                <span>Licensed States</span>
                <span className="text-accent-500 text-xs font-normal">
                  {selectedStates.length} selected
                </span>
              </h3>

              {/* Selected states display */}
              {selectedStates.length > 0 && (
                <div className="flex flex-wrap gap-2 p-3 bg-secondary/50 rounded-lg">
                  {selectedStates.map((state) => (
                    <Badge
                      key={state}
                      variant="outline"
                      className="border-accent-500 text-accent-500 cursor-pointer hover:bg-accent-500/10 pr-1"
                      onClick={() => toggleState(state)}
                    >
                      {state} - {STATE_NAMES[state]}
                      <X className="h-3 w-3 ml-1" />
                    </Badge>
                  ))}
                </div>
              )}

              {/* State grid */}
              <div className="grid grid-cols-5 gap-2 max-h-48 overflow-y-auto p-2 bg-secondary/30 rounded-lg">
                {US_STATES.map((state) => {
                  const isSelected = selectedStates.includes(state);
                  return (
                    <Button
                      key={state}
                      type="button"
                      size="sm"
                      variant={isSelected ? 'default' : 'outline'}
                      className={
                        isSelected
                          ? 'bg-accent-500 hover:bg-accent-600 text-white'
                          : 'border text-muted-foreground hover:text-foreground hover:border-zinc-500'
                      }
                      onClick={() => toggleState(state)}
                    >
                      {state}
                    </Button>
                  );
                })}
              </div>

              <p className="text-muted-foreground text-xs">
                Select all states where this broker is licensed to operate.
              </p>
            </div>

            {/* E&O Insurance */}
            <div className="space-y-4">
              <h3 className="text-foreground font-medium text-sm border-b border pb-2">
                E&O Insurance
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Policy Number</Label>
                  <Input
                    value={editForm.eoInsurancePolicy || ''}
                    onChange={(e) => setEditForm({ ...editForm, eoInsurancePolicy: e.target.value })}
                    className="bg-secondary border text-foreground"
                  />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setEditDialogOpen(false)}
              className="border text-foreground"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveEdit}
              className="bg-accent-500 hover:bg-accent-600"
              disabled={updateBroker.isPending || selectedStates.length === 0}
            >
              {updateBroker.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deal Rejection Dialog */}
      <Dialog open={rejectDealDialogOpen} onOpenChange={setRejectDealDialogOpen}>
        <DialogContent className="bg-card border max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <XCircle className="h-5 w-5 text-red-500" />
              Reject Deal
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Provide a reason for rejecting this deal. This will be visible to the wholesaler.
            </DialogDescription>
          </DialogHeader>
          {dealToReject && (
            <div className="py-4 space-y-4">
              <div className="bg-secondary/50 rounded-lg p-3">
                <p className="text-foreground font-medium">{getAddress(dealToReject)}</p>
                <p className="text-muted-foreground text-sm">
                  {dealToReject.city}, {dealToReject.state} - {formatPrice(dealToReject.askingPrice)}
                </p>
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground">Rejection Reason *</Label>
                <Input
                  placeholder="Enter reason for rejection..."
                  value={dealRejectionReason}
                  onChange={(e) => setDealRejectionReason(e.target.value)}
                  className="bg-secondary border text-foreground"
                />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setRejectDealDialogOpen(false)}
              className="border text-foreground"
            >
              Cancel
            </Button>
            <Button
              onClick={handleRejectDeal}
              className="bg-red-600 hover:bg-red-700"
              disabled={rejectDeal.isPending || !dealRejectionReason.trim()}
            >
              {rejectDeal.isPending ? 'Rejecting...' : 'Reject Deal'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deal Detail Dialog */}
      <Dialog open={dealDetailDialogOpen} onOpenChange={setDealDetailDialogOpen}>
        <DialogContent className="bg-card border max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <FileText className="h-5 w-5 text-accent-500" />
              Deal Details
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Review deal information before approving or rejecting
            </DialogDescription>
          </DialogHeader>

          {selectedDeal && (
            <div className="space-y-6 py-4">
              {/* Property Address Header */}
              <div className="bg-secondary/50 rounded-lg p-4">
                <h3 className="text-foreground font-medium text-lg">{getAddress(selectedDeal)}</h3>
                <p className="text-muted-foreground">
                  {selectedDeal.city}, {selectedDeal.state} {selectedDeal.zip}
                </p>
              </div>

              {/* Property Details */}
              <div className="space-y-3">
                <h4 className="text-foreground font-medium flex items-center gap-2 text-sm border-b border pb-2">
                  <Building2 className="h-4 w-4 text-accent-500" />
                  Property Information
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-muted-foreground text-xs uppercase tracking-wide">Property Type</p>
                    <p className="text-foreground font-medium">{selectedDeal.propertyType || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs uppercase tracking-wide">Asking Price</p>
                    <p className="text-foreground font-medium text-lg">{formatPrice(selectedDeal.askingPrice)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs uppercase tracking-wide">Beds / Baths</p>
                    <p className="text-foreground font-medium">
                      {selectedDeal.bedroomCount || 'N/A'} beds / {selectedDeal.bathroomCount || 'N/A'} baths
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs uppercase tracking-wide">Square Footage</p>
                    <p className="text-foreground font-medium">
                      {selectedDeal.livingSpaceSqFt ? `${selectedDeal.livingSpaceSqFt.toLocaleString()} sq ft` : 'N/A'}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs uppercase tracking-wide">Year Built</p>
                    <p className="text-foreground font-medium">{selectedDeal.yearBuilt || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs uppercase tracking-wide">Lot Size</p>
                    <p className="text-foreground font-medium">
                      {selectedDeal.lotSizeSqFt ? `${selectedDeal.lotSizeSqFt.toLocaleString()} sq ft` : 'N/A'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Financial Details */}
              <div className="space-y-3">
                <h4 className="text-foreground font-medium flex items-center gap-2 text-sm border-b border pb-2">
                  <FileText className="h-4 w-4 text-accent-500" />
                  Financial Details
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-muted-foreground text-xs uppercase tracking-wide">ARV (After Repair Value)</p>
                    <p className="text-foreground font-medium">{formatPrice(selectedDeal.arv)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs uppercase tracking-wide">Repair Estimate</p>
                    <p className="text-foreground font-medium">{formatPrice(selectedDeal.repairEstimate)}</p>
                  </div>
                </div>
              </div>

              {/* Compliance Status */}
              {selectedDeal.complianceStatus && (
                <div className="space-y-3">
                  <h4 className="text-foreground font-medium flex items-center gap-2 text-sm border-b border pb-2">
                    <Shield className="h-4 w-4 text-accent-500" />
                    Compliance Status
                  </h4>
                  <div className="flex items-center gap-2">
                    <Badge
                      className={
                        selectedDeal.complianceStatus === 'Green'
                          ? 'bg-green-500/10 text-green-500 border-green-500/20'
                          : selectedDeal.complianceStatus === 'Yellow'
                          ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20'
                          : 'bg-red-500/10 text-red-500 border-red-500/20'
                      }
                    >
                      {selectedDeal.complianceStatus}
                    </Badge>
                    {selectedDeal.complianceNotes && (
                      <span className="text-muted-foreground text-sm">{selectedDeal.complianceNotes}</span>
                    )}
                  </div>
                </div>
              )}

              {/* Description */}
              {selectedDeal.description && (
                <div className="space-y-3">
                  <h4 className="text-foreground font-medium flex items-center gap-2 text-sm border-b border pb-2">
                    Description
                  </h4>
                  <p className="text-foreground text-sm">{selectedDeal.description}</p>
                </div>
              )}

              {/* Submission Info */}
              <div className="bg-secondary/50 rounded-lg p-3">
                <p className="text-muted-foreground text-xs">
                  Submitted on {selectedDeal.createdAt ? new Date(selectedDeal.createdAt).toLocaleDateString() : 'N/A'} at{' '}
                  {selectedDeal.createdAt ? new Date(selectedDeal.createdAt).toLocaleTimeString() : 'N/A'}
                </p>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setDealDetailDialogOpen(false)}
              className="border text-foreground"
            >
              Close
            </Button>
            {selectedDeal && (
              <>
                <Button
                  variant="outline"
                  className="border-red-600 text-red-500 hover:bg-red-600/10"
                  onClick={() => {
                    setDealDetailDialogOpen(false);
                    openRejectDealDialog(selectedDeal);
                  }}
                  disabled={setDealLive.isPending || rejectDeal.isPending}
                >
                  <XCircle className="h-4 w-4 mr-1" />
                  Reject
                </Button>
                <Button
                  className="bg-green-600 hover:bg-green-700"
                  onClick={() => {
                    handleApproveDeal(selectedDeal.id);
                    setDealDetailDialogOpen(false);
                  }}
                  disabled={setDealLive.isPending || rejectDeal.isPending}
                >
                  <CheckCircle2 className="h-4 w-4 mr-1" />
                  Approve
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
