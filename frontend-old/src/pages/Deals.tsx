import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import {
  Box,
  Paper,
  Typography,
  Button,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Grid,
  Alert,
  LinearProgress,
  Tooltip,
  Menu,
} from '@mui/material';
import { DataGrid, GridColDef, GridRenderCellParams } from '@mui/x-data-grid';
import {
  Add as AddIcon,
  Refresh as RefreshIcon,
  Assessment as ScoreIcon,
  MoreVert as MoreIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Visibility as ViewIcon,
} from '@mui/icons-material';
import { dealsApi, Deal, ScoringResult } from '../services/api';

const statusColors: Record<string, 'default' | 'primary' | 'secondary' | 'success' | 'error' | 'info' | 'warning'> = {
  new: 'info',
  reviewing: 'warning',
  submitted: 'secondary',
  accepted: 'success',
  rejected: 'error',
  countered: 'primary',
};

const Deals: React.FC = () => {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState({ status: '', state: '' });
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [showScoreDialog, setShowScoreDialog] = useState(false);
  const [scoringResults, setScoringResults] = useState<ScoringResult[]>([]);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [menuDeal, setMenuDeal] = useState<Deal | null>(null);

  const { data, isLoading, error, refetch } = useQuery(
    ['deals', filters],
    () => dealsApi.getAll(filters.status ? { status: filters.status } : undefined),
    {
      retry: 1,
      onError: () => {},
    }
  );

  const scoreMutation = useMutation(
    (dealId: number) => dealsApi.score(dealId),
    {
      onSuccess: (data) => {
        setScoringResults(data.results);
        setShowScoreDialog(true);
      },
    }
  );

  const updateStatusMutation = useMutation(
    ({ id, status }: { id: number; status: Deal['status'] }) => dealsApi.updateStatus(id, status),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('deals');
      },
    }
  );

  const deleteMutation = useMutation(
    (id: number) => dealsApi.delete(id),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('deals');
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
      address: { street: '123 Oak Street', city: 'Dallas', state: 'TX', zipCode: '75201' },
      askingPrice: 285000,
      arv: 350000,
      bedrooms: 3,
      bathrooms: 2,
      squareFeet: 1850,
      yearBuilt: 1995,
      source: 'Email',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 2,
      propertyId: 'PROP-002',
      status: 'reviewing',
      propertyType: 'Single Family',
      address: { street: '456 Pine Avenue', city: 'Atlanta', state: 'GA', zipCode: '30301' },
      askingPrice: 195000,
      arv: 260000,
      bedrooms: 4,
      bathrooms: 2.5,
      squareFeet: 2200,
      yearBuilt: 2002,
      source: 'REI Skiptracing',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 3,
      propertyId: 'PROP-003',
      status: 'submitted',
      propertyType: 'Townhouse',
      address: { street: '789 Maple Drive', city: 'Phoenix', state: 'AZ', zipCode: '85001' },
      askingPrice: 245000,
      arv: 310000,
      bedrooms: 3,
      bathrooms: 2,
      squareFeet: 1650,
      yearBuilt: 2010,
      source: 'PropStream',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  const deals = data?.deals || demoDeals;

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, deal: Deal) => {
    setAnchorEl(event.currentTarget);
    setMenuDeal(deal);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
    setMenuDeal(null);
  };

  const handleScore = (deal: Deal) => {
    setSelectedDeal(deal);
    scoreMutation.mutate(deal.id);
    handleMenuClose();
  };

  const handleStatusChange = (deal: Deal, status: Deal['status']) => {
    updateStatusMutation.mutate({ id: deal.id, status });
    handleMenuClose();
  };

  const handleDelete = (deal: Deal) => {
    if (window.confirm(`Delete deal ${deal.address.street}?`)) {
      deleteMutation.mutate(deal.id);
    }
    handleMenuClose();
  };

  const columns: GridColDef[] = [
    { field: 'propertyId', headerName: 'ID', width: 100 },
    {
      field: 'address',
      headerName: 'Address',
      width: 250,
      valueGetter: (params: any) => {
        const addr = params.row.address;
        return `${addr.street}, ${addr.city}, ${addr.state}`;
      },
    },
    { field: 'propertyType', headerName: 'Type', width: 120 },
    {
      field: 'askingPrice',
      headerName: 'Asking Price',
      width: 130,
      valueFormatter: (params: any) => `$${params.value?.toLocaleString() || 0}`,
    },
    {
      field: 'arv',
      headerName: 'ARV',
      width: 120,
      valueFormatter: (params: any) => params.value ? `$${params.value.toLocaleString()}` : '-',
    },
    {
      field: 'bedrooms',
      headerName: 'Beds/Baths',
      width: 100,
      valueGetter: (params: any) => `${params.row.bedrooms || '-'}/${params.row.bathrooms || '-'}`,
    },
    {
      field: 'status',
      headerName: 'Status',
      width: 120,
      renderCell: (params: GridRenderCellParams) => (
        <Chip
          label={params.value}
          color={statusColors[params.value as string] || 'default'}
          size="small"
          sx={{ textTransform: 'capitalize' }}
        />
      ),
    },
    {
      field: 'source',
      headerName: 'Source',
      width: 130,
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 120,
      sortable: false,
      renderCell: (params: GridRenderCellParams) => (
        <Box>
          <Tooltip title="Score Deal">
            <IconButton
              size="small"
              color="primary"
              onClick={() => handleScore(params.row)}
              disabled={scoreMutation.isLoading}
            >
              <ScoreIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <IconButton
            size="small"
            onClick={(e) => handleMenuOpen(e, params.row)}
          >
            <MoreIcon fontSize="small" />
          </IconButton>
        </Box>
      ),
    },
  ];

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" sx={{ fontWeight: 600 }}>
          Deals
        </Typography>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={() => refetch()}
          >
            Refresh
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
          >
            Add Deal
          </Button>
        </Box>
      </Box>

      {!!error && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Unable to connect to backend. Showing demo data.
        </Alert>
      )}

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} sm={4} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel>Status</InputLabel>
              <Select
                value={filters.status}
                label="Status"
                onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              >
                <MenuItem value="">All</MenuItem>
                <MenuItem value="new">New</MenuItem>
                <MenuItem value="reviewing">Reviewing</MenuItem>
                <MenuItem value="submitted">Submitted</MenuItem>
                <MenuItem value="accepted">Accepted</MenuItem>
                <MenuItem value="rejected">Rejected</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={4} md={3}>
            <TextField
              fullWidth
              size="small"
              label="Search"
              placeholder="Address, city, state..."
              onChange={(e) => setFilters({ ...filters, state: e.target.value })}
            />
          </Grid>
        </Grid>
      </Paper>

      {/* Data Grid */}
      <Paper sx={{ height: 600 }}>
        <DataGrid
          rows={deals}
          columns={columns}
          loading={isLoading}
          pageSizeOptions={[10, 25, 50]}
          initialState={{
            pagination: { paginationModel: { pageSize: 25 } },
          }}
          disableRowSelectionOnClick
          sx={{
            '& .MuiDataGrid-row:hover': {
              bgcolor: 'action.hover',
            },
          }}
        />
      </Paper>

      {/* Actions Menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
      >
        <MenuItem onClick={() => menuDeal && handleScore(menuDeal)}>
          <ScoreIcon fontSize="small" sx={{ mr: 1 }} /> Score Deal
        </MenuItem>
        <MenuItem onClick={() => {}}>
          <ViewIcon fontSize="small" sx={{ mr: 1 }} /> View Details
        </MenuItem>
        <MenuItem onClick={() => {}}>
          <EditIcon fontSize="small" sx={{ mr: 1 }} /> Edit
        </MenuItem>
        <MenuItem onClick={() => menuDeal && handleStatusChange(menuDeal, 'reviewing')}>
          Move to Reviewing
        </MenuItem>
        <MenuItem onClick={() => menuDeal && handleStatusChange(menuDeal, 'submitted')}>
          Mark as Submitted
        </MenuItem>
        <MenuItem onClick={() => menuDeal && handleDelete(menuDeal)} sx={{ color: 'error.main' }}>
          <DeleteIcon fontSize="small" sx={{ mr: 1 }} /> Delete
        </MenuItem>
      </Menu>

      {/* Scoring Results Dialog */}
      <Dialog
        open={showScoreDialog}
        onClose={() => setShowScoreDialog(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          Scoring Results
          {selectedDeal && (
            <Typography variant="body2" color="textSecondary">
              {selectedDeal.address.street}, {selectedDeal.address.city}, {selectedDeal.address.state}
            </Typography>
          )}
        </DialogTitle>
        <DialogContent>
          {scoreMutation.isLoading ? (
            <Box sx={{ py: 4 }}>
              <LinearProgress />
              <Typography align="center" sx={{ mt: 2 }}>
                Scoring deal against buy boxes...
              </Typography>
            </Box>
          ) : scoringResults.length > 0 ? (
            <Box>
              {scoringResults
                .sort((a, b) => b.matchPercentage - a.matchPercentage)
                .map((result) => (
                  <Paper key={result.buyBoxId} sx={{ p: 2, mb: 2, border: '1px solid', borderColor: 'divider' }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                      <Box>
                        <Typography variant="h6">{result.buyBoxName}</Typography>
                        <Typography variant="body2" color="textSecondary">
                          {result.fundName}
                        </Typography>
                      </Box>
                      <Chip
                        label={`${result.matchPercentage.toFixed(1)}%`}
                        color={result.matchPercentage >= 70 ? 'success' : result.matchPercentage >= 50 ? 'warning' : 'error'}
                        sx={{ fontSize: '1rem', fontWeight: 600 }}
                      />
                    </Box>
                    <LinearProgress
                      variant="determinate"
                      value={result.matchPercentage}
                      sx={{ height: 8, borderRadius: 4, mb: 1 }}
                      color={result.matchPercentage >= 70 ? 'success' : result.matchPercentage >= 50 ? 'warning' : 'error'}
                    />
                    {result.hardNos.length > 0 && (
                      <Box sx={{ mt: 1 }}>
                        <Typography variant="caption" color="error">
                          Hard NOs: {result.hardNos.join(', ')}
                        </Typography>
                      </Box>
                    )}
                  </Paper>
                ))}
            </Box>
          ) : (
            <Alert severity="info">No matching buy boxes found for this deal.</Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowScoreDialog(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Deals;
