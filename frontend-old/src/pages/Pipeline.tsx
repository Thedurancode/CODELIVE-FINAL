import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import {
  Box,
  Paper,
  Typography,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Alert,
  Tooltip,
  Grid,
} from '@mui/material';
import {
  DragIndicator as DragIcon,
  Visibility as ViewIcon,
  Assessment as ScoreIcon,
  ArrowForward as MoveIcon,
} from '@mui/icons-material';
import { dealsApi, Deal } from '../services/api';

interface Column {
  id: string;
  title: string;
  color: string;
  deals: Deal[];
}

const Pipeline: React.FC = () => {
  const queryClient = useQueryClient();
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [showMoveDialog, setShowMoveDialog] = useState(false);

  const { data, error } = useQuery(
    'pipeline',
    async () => {
      const result = await dealsApi.getAll();
      return result.deals;
    },
    {
      retry: 1,
      onError: () => {},
    }
  );

  const updateStatusMutation = useMutation(
    ({ id, status }: { id: number; status: Deal['status'] }) => dealsApi.updateStatus(id, status),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('pipeline');
        setShowMoveDialog(false);
      },
    }
  );

  // Demo data fallback
  const demoDeals: Deal[] = [
    {
      id: 1,
      propertyId: 'PROP-001',
      status: 'new',
      propertyType: 'Single Family',
      address: { street: '123 Oak St', city: 'Dallas', state: 'TX', zipCode: '75201' },
      askingPrice: 285000,
      bedrooms: 3,
      bathrooms: 2,
      source: 'Email',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 2,
      propertyId: 'PROP-002',
      status: 'new',
      propertyType: 'Townhouse',
      address: { street: '456 Elm Ave', city: 'Dallas', state: 'TX', zipCode: '75202' },
      askingPrice: 195000,
      bedrooms: 2,
      bathrooms: 2,
      source: 'PropStream',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 3,
      propertyId: 'PROP-003',
      status: 'reviewing',
      propertyType: 'Single Family',
      address: { street: '789 Pine Rd', city: 'Atlanta', state: 'GA', zipCode: '30301' },
      askingPrice: 225000,
      bedrooms: 4,
      bathrooms: 2.5,
      source: 'REI Skiptracing',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 4,
      propertyId: 'PROP-004',
      status: 'reviewing',
      propertyType: 'Single Family',
      address: { street: '321 Maple Dr', city: 'Phoenix', state: 'AZ', zipCode: '85001' },
      askingPrice: 310000,
      bedrooms: 3,
      bathrooms: 2,
      source: 'Email',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 5,
      propertyId: 'PROP-005',
      status: 'submitted',
      propertyType: 'Single Family',
      address: { street: '654 Cedar Ln', city: 'Houston', state: 'TX', zipCode: '77001' },
      askingPrice: 275000,
      bedrooms: 3,
      bathrooms: 2,
      source: 'Email',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 6,
      propertyId: 'PROP-006',
      status: 'accepted',
      propertyType: 'Single Family',
      address: { street: '987 Birch Way', city: 'Austin', state: 'TX', zipCode: '78701' },
      askingPrice: 345000,
      bedrooms: 4,
      bathrooms: 3,
      source: 'Direct',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 7,
      propertyId: 'PROP-007',
      status: 'rejected',
      propertyType: 'Condo',
      address: { street: '147 Spruce St', city: 'Miami', state: 'FL', zipCode: '33101' },
      askingPrice: 180000,
      bedrooms: 2,
      bathrooms: 1,
      source: 'Email',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  const deals = data || demoDeals;

  // Group deals by status
  const columns: Column[] = [
    {
      id: 'new',
      title: 'New',
      color: '#1976d2',
      deals: deals.filter((d) => d.status === 'new'),
    },
    {
      id: 'reviewing',
      title: 'Reviewing',
      color: '#ed6c02',
      deals: deals.filter((d) => d.status === 'reviewing'),
    },
    {
      id: 'submitted',
      title: 'Submitted',
      color: '#9c27b0',
      deals: deals.filter((d) => d.status === 'submitted'),
    },
    {
      id: 'accepted',
      title: 'Accepted',
      color: '#2e7d32',
      deals: deals.filter((d) => d.status === 'accepted'),
    },
    {
      id: 'rejected',
      title: 'Rejected',
      color: '#d32f2f',
      deals: deals.filter((d) => d.status === 'rejected'),
    },
  ];

  const handleMove = (deal: Deal, newStatus: Deal['status']) => {
    updateStatusMutation.mutate({ id: deal.id, status: newStatus });
  };

  const DealCard = ({ deal }: { deal: Deal }) => (
    <Card
      sx={{
        mb: 1.5,
        cursor: 'pointer',
        transition: 'all 0.2s',
        '&:hover': {
          boxShadow: 3,
          transform: 'translateY(-2px)',
        },
      }}
      onClick={() => {
        setSelectedDeal(deal);
        setShowMoveDialog(true);
      }}
    >
      <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
          <DragIcon sx={{ color: 'action.disabled', fontSize: 18, mt: 0.5 }} />
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="body2" fontWeight={600} noWrap>
              {deal.address.street}
            </Typography>
            <Typography variant="caption" color="textSecondary" display="block">
              {deal.address.city}, {deal.address.state}
            </Typography>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1 }}>
              <Typography variant="body2" color="primary" fontWeight={600}>
                ${deal.askingPrice.toLocaleString()}
              </Typography>
              <Box sx={{ display: 'flex', gap: 0.5 }}>
                <Chip label={deal.propertyType} size="small" variant="outlined" sx={{ fontSize: '0.65rem', height: 20 }} />
                <Chip label={`${deal.bedrooms}/${deal.bathrooms}`} size="small" sx={{ fontSize: '0.65rem', height: 20 }} />
              </Box>
            </Box>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 3, fontWeight: 600 }}>
        Pipeline
      </Typography>

      {!!error && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Unable to connect to backend. Showing demo data.
        </Alert>
      )}

      <Box
        sx={{
          display: 'flex',
          gap: 2,
          overflowX: 'auto',
          pb: 2,
          minHeight: 'calc(100vh - 200px)',
        }}
      >
        {columns.map((column) => (
          <Paper
            key={column.id}
            sx={{
              minWidth: 280,
              maxWidth: 320,
              flex: '1 1 280px',
              bgcolor: 'grey.50',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Column Header */}
            <Box
              sx={{
                p: 2,
                borderBottom: '3px solid',
                borderColor: column.color,
                bgcolor: 'white',
              }}
            >
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="subtitle1" fontWeight={600}>
                  {column.title}
                </Typography>
                <Chip
                  label={column.deals.length}
                  size="small"
                  sx={{ bgcolor: `${column.color}20`, color: column.color, fontWeight: 600 }}
                />
              </Box>
            </Box>

            {/* Column Content */}
            <Box sx={{ p: 1.5, flexGrow: 1, overflowY: 'auto' }}>
              {column.deals.length === 0 ? (
                <Box
                  sx={{
                    textAlign: 'center',
                    py: 4,
                    color: 'text.disabled',
                  }}
                >
                  <Typography variant="body2">No deals</Typography>
                </Box>
              ) : (
                column.deals.map((deal) => <DealCard key={deal.id} deal={deal} />)
              )}
            </Box>
          </Paper>
        ))}
      </Box>

      {/* Move Dialog */}
      <Dialog
        open={showMoveDialog}
        onClose={() => setShowMoveDialog(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          {selectedDeal && (
            <>
              <Typography variant="h6">{selectedDeal.address.street}</Typography>
              <Typography variant="body2" color="textSecondary">
                {selectedDeal.address.city}, {selectedDeal.address.state} {selectedDeal.address.zipCode}
              </Typography>
            </>
          )}
        </DialogTitle>
        <DialogContent>
          {selectedDeal && (
            <Box>
              <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid item xs={6}>
                  <Typography variant="caption" color="textSecondary">Asking Price</Typography>
                  <Typography variant="h6">${selectedDeal.askingPrice.toLocaleString()}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="caption" color="textSecondary">Property Type</Typography>
                  <Typography variant="h6">{selectedDeal.propertyType}</Typography>
                </Grid>
                <Grid item xs={4}>
                  <Typography variant="caption" color="textSecondary">Beds</Typography>
                  <Typography>{selectedDeal.bedrooms}</Typography>
                </Grid>
                <Grid item xs={4}>
                  <Typography variant="caption" color="textSecondary">Baths</Typography>
                  <Typography>{selectedDeal.bathrooms}</Typography>
                </Grid>
                <Grid item xs={4}>
                  <Typography variant="caption" color="textSecondary">Source</Typography>
                  <Typography>{selectedDeal.source}</Typography>
                </Grid>
              </Grid>

              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Move to:
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {columns
                  .filter((col) => col.id !== selectedDeal.status)
                  .map((col) => (
                    <Button
                      key={col.id}
                      variant="outlined"
                      startIcon={<MoveIcon />}
                      onClick={() => handleMove(selectedDeal, col.id as Deal['status'])}
                      disabled={updateStatusMutation.isLoading}
                      sx={{
                        borderColor: col.color,
                        color: col.color,
                        '&:hover': {
                          borderColor: col.color,
                          bgcolor: `${col.color}10`,
                        },
                      }}
                    >
                      {col.title}
                    </Button>
                  ))}
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowMoveDialog(false)}>Close</Button>
          <Tooltip title="View full details">
            <Button variant="outlined" startIcon={<ViewIcon />}>
              View Details
            </Button>
          </Tooltip>
          <Tooltip title="Score against buy boxes">
            <Button variant="contained" startIcon={<ScoreIcon />}>
              Score Deal
            </Button>
          </Tooltip>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Pipeline;
