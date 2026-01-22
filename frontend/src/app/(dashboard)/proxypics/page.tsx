'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  RefreshCw,
  ExternalLink,
  Loader2,
  Camera,
  CheckCircle,
  Clock,
  XCircle,
  AlertCircle,
  Upload,
  DollarSign,
  Image as ImageIcon,
  MapPin,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface ProxyPicsOrder {
  id: string;
  orderId: string;
  propertyId: string;
  status: string;
  address: string;
  paymentIntentId?: string;
  orderedAt: string;
  updatedAt: string;
}

export default function ProxyPicsPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<ProxyPicsOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refundDialogOpen, setRefundDialogOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<ProxyPicsOrder | null>(null);
  const [refundReason, setRefundReason] = useState<string>('requested_by_customer');
  const [processingRefund, setProcessingRefund] = useState(false);

  const fetchOrders = async (showLoadingSpinner = true) => {
    if (showLoadingSpinner) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/payments/orders/proxypics`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('dispotree_token')}`,
          },
        }
      );

      const data = await response.json();

      if (data.success) {
        setOrders(data.data || []);
      } else {
        throw new Error(data.error || 'Failed to fetch orders');
      }
    } catch (error) {
      console.error('Fetch ProxyPics orders error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to fetch orders');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const handleRefresh = () => {
    fetchOrders(false);
  };

  const handleViewProperty = (propertyId: string) => {
    router.push(`/deals/${propertyId}`);
  };

  const handleOpenRefundDialog = (order: ProxyPicsOrder) => {
    setSelectedOrder(order);
    setRefundDialogOpen(true);
  };

  const handleCloseRefundDialog = () => {
    setRefundDialogOpen(false);
    setSelectedOrder(null);
    setRefundReason('requested_by_customer');
  };

  const handleProcessRefund = async () => {
    if (!selectedOrder || !selectedOrder.paymentIntentId) {
      toast.error('No payment ID found for this order');
      return;
    }

    setProcessingRefund(true);
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/payments/refund/${selectedOrder.paymentIntentId}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${localStorage.getItem('dispotree_token')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            reason: refundReason,
          }),
        }
      );

      const data = await response.json();

      if (data.success) {
        toast.success('Refund processed successfully');
        handleCloseRefundDialog();
        fetchOrders(false);
      } else {
        throw new Error(data.error || 'Failed to process refund');
      }
    } catch (error) {
      console.error('Process refund error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to process refund');
    } finally {
      setProcessingRefund(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { label: string; icon: React.ElementType; className: string }> = {
      unassigned: {
        label: 'Waiting for Photographer',
        icon: Clock,
        className: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
      },
      assigned: {
        label: 'Photographer Assigned',
        icon: Clock,
        className: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
      },
      upload_started: {
        label: 'Uploading Photos',
        icon: Upload,
        className: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
      },
      completed: {
        label: 'Completed',
        icon: CheckCircle,
        className: 'bg-green-500/10 text-green-500 border-green-500/20',
      },
      fulfilled: {
        label: 'Fulfilled',
        icon: CheckCircle,
        className: 'bg-green-500/10 text-green-500 border-green-500/20',
      },
      canceled: {
        label: 'Canceled',
        icon: XCircle,
        className: 'bg-red-500/10 text-red-500 border-red-500/20',
      },
      expired: {
        label: 'Expired',
        icon: XCircle,
        className: 'bg-red-500/10 text-red-500 border-red-500/20',
      },
      on_hold: {
        label: 'On Hold',
        icon: AlertCircle,
        className: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
      },
      unknown: {
        label: 'Unknown',
        icon: AlertCircle,
        className: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
      },
    };

    const config = statusConfig[status] || statusConfig.unknown;
    const Icon = config.icon;

    return (
      <Badge variant="outline" className={cn('gap-1', config.className)}>
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  // Calculate stats
  const stats = {
    total: orders.length,
    pending: orders.filter((o) => ['unassigned', 'assigned'].includes(o.status)).length,
    inProgress: orders.filter((o) => o.status === 'upload_started').length,
    completed: orders.filter((o) => ['completed', 'fulfilled'].includes(o.status)).length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">ProxyPics Orders</h1>
          <p className="text-muted-foreground mt-1">
            Manage professional property photography orders
          </p>
        </div>
        <Button
          variant="outline"
          onClick={handleRefresh}
          disabled={refreshing}
        >
          <RefreshCw className={cn('mr-2 h-4 w-4', refreshing && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="bg-card border">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-accent-500/10">
                <Camera className="h-6 w-6 text-accent-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stats.total}</p>
                <p className="text-sm text-muted-foreground">Total Orders</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-yellow-500/10">
                <Clock className="h-6 w-6 text-yellow-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stats.pending}</p>
                <p className="text-sm text-muted-foreground">Pending</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-blue-500/10">
                <Upload className="h-6 w-6 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stats.inProgress}</p>
                <p className="text-sm text-muted-foreground">In Progress</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-green-500/10">
                <CheckCircle className="h-6 w-6 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stats.completed}</p>
                <p className="text-sm text-muted-foreground">Completed</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Orders Table */}
      <Card className="bg-card border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5 text-accent-500" />
            Photo Orders
          </CardTitle>
          <CardDescription>
            Track and manage all professional photography orders
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-accent-500 mb-4" />
              <p className="text-muted-foreground">Loading orders...</p>
            </div>
          ) : orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Camera className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-lg font-medium text-foreground">No ProxyPics orders yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Orders will appear here when you request professional photos for properties
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-secondary/50">
                    <TableHead className="text-foreground">Order ID</TableHead>
                    <TableHead className="text-foreground">Property Address</TableHead>
                    <TableHead className="text-foreground">Status</TableHead>
                    <TableHead className="text-foreground">Ordered Date</TableHead>
                    <TableHead className="text-foreground">Payment ID</TableHead>
                    <TableHead className="text-foreground text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((order) => (
                    <TableRow key={order.id} className="hover:bg-secondary/30">
                      <TableCell className="font-mono text-sm">
                        #{order.orderId.substring(0, 12)}...
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 max-w-xs">
                          <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <span className="truncate">{order.address}</span>
                        </div>
                      </TableCell>
                      <TableCell>{getStatusBadge(order.status)}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {new Date(order.orderedAt).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {order.paymentIntentId ? (
                          <>pi_{order.paymentIntentId.substring(3, 15)}...</>
                        ) : (
                          <span className="text-muted-foreground/50">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          {order.paymentIntentId && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleOpenRefundDialog(order)}
                              className="hover:bg-red-600/10 text-red-500 hover:text-red-600"
                            >
                              <DollarSign className="h-4 w-4 mr-1" />
                              Refund
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleViewProperty(order.propertyId)}
                            className="hover:bg-accent-600/10"
                          >
                            <ExternalLink className="h-4 w-4 mr-1" />
                            View Property
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {orders.length > 0 && (
            <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
              <p>Total orders: {orders.length}</p>
              <p className="text-xs">Last updated: {new Date().toLocaleTimeString()}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Refund Dialog */}
      <Dialog open={refundDialogOpen} onOpenChange={setRefundDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Process Refund</DialogTitle>
            <DialogDescription>
              Issue a refund for this ProxyPics order. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          {selectedOrder && (
            <div className="space-y-4">
              <div className="rounded-lg border border-border p-4 space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Order ID:</span>
                  <span className="text-sm font-mono">
                    #{selectedOrder.orderId.substring(0, 12)}...
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Property:</span>
                  <span className="text-sm">{selectedOrder.address}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Payment ID:</span>
                  <span className="text-sm font-mono text-xs">
                    {selectedOrder.paymentIntentId?.substring(0, 20)}...
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Refund Reason</label>
                <Select value={refundReason} onValueChange={setRefundReason}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a reason" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="requested_by_customer">Requested by Customer</SelectItem>
                    <SelectItem value="duplicate">Duplicate Payment</SelectItem>
                    <SelectItem value="fraudulent">Fraudulent</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="rounded-lg bg-yellow-500/10 border border-yellow-500/20 p-3">
                <p className="text-sm text-yellow-600 dark:text-yellow-500">
                  <strong>Warning:</strong> This will refund the full payment amount to the
                  customer's original payment method.
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={handleCloseRefundDialog} disabled={processingRefund}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleProcessRefund} disabled={processingRefund}>
              {processingRefund ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <DollarSign className="mr-2 h-4 w-4" />
                  Process Refund
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
