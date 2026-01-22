import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import {
  Box,
  Grid,
  Card,
  CardContent,
  CardActions,
  Typography,
  Button,
  Chip,
  Switch,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControlLabel,
  Collapse,
  Alert,
  Tooltip,
  Divider,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  ExpandMore as ExpandIcon,
  ExpandLess as CollapseIcon,
  Email as EmailIcon,
  Phone as PhoneIcon,
  LocationOn as LocationIcon,
  AttachMoney as MoneyIcon,
} from '@mui/icons-material';
import { buyBoxesApi, BuyBox } from '../services/api';

const BuyBoxes: React.FC = () => {
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [editingBox, setEditingBox] = useState<BuyBox | null>(null);

  const { data: buyBoxes, error } = useQuery(
    'buyBoxes',
    buyBoxesApi.getAll,
    {
      retry: 1,
      onError: () => {},
    }
  );

  const toggleMutation = useMutation(
    ({ id, enabled }: { id: string; enabled: boolean }) => buyBoxesApi.toggle(id, enabled),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('buyBoxes');
      },
    }
  );

  const deleteMutation = useMutation(
    (id: string) => buyBoxesApi.delete(id),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('buyBoxes');
      },
    }
  );

  // Demo data fallback
  const demoBuyBoxes: BuyBox[] = [
    {
      id: '1',
      name: 'Texas SFR Portfolio',
      fundName: 'Blackstone SFR',
      description: 'Core Texas markets - DFW, Houston, Austin, San Antonio',
      enabled: true,
      priority: 1,
      autoSubmit: true,
      autoSubmitThreshold: 75,
      contactEmail: 'acquisitions@blackstone.com',
      contactPhone: '555-123-4567',
      criteria: {
        states: ['TX'],
        propertyTypes: ['Single Family', 'Townhouse'],
        minPrice: 150000,
        maxPrice: 400000,
        minBedrooms: 3,
        minBathrooms: 2,
        minSqft: 1400,
        minYearBuilt: 1990,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: '2',
      name: 'Southeast Value-Add',
      fundName: 'Pretium Partners',
      description: 'Value-add opportunities in GA, NC, SC, FL',
      enabled: true,
      priority: 2,
      autoSubmit: false,
      contactEmail: 'deals@pretium.com',
      criteria: {
        states: ['GA', 'NC', 'SC', 'FL'],
        propertyTypes: ['Single Family'],
        minPrice: 100000,
        maxPrice: 300000,
        minBedrooms: 3,
        conditions: ['Light Rehab', 'Medium Rehab'],
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: '3',
      name: 'Phoenix Metro',
      fundName: 'AMH Portfolio',
      description: 'Greater Phoenix area acquisitions',
      enabled: false,
      priority: 5,
      autoSubmit: true,
      autoSubmitThreshold: 80,
      contactEmail: 'phoenix@amh.com',
      criteria: {
        states: ['AZ'],
        cities: ['Phoenix', 'Scottsdale', 'Tempe', 'Mesa', 'Gilbert', 'Chandler'],
        propertyTypes: ['Single Family'],
        minPrice: 200000,
        maxPrice: 450000,
        minBedrooms: 3,
        minYearBuilt: 2000,
        allowPool: true,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  const boxes = buyBoxes || demoBuyBoxes;
  const enabledCount = boxes.filter((b) => b.enabled).length;

  const handleToggle = (box: BuyBox) => {
    toggleMutation.mutate({ id: box.id, enabled: !box.enabled });
  };

  const handleDelete = (box: BuyBox) => {
    if (window.confirm(`Delete buy box "${box.name}"?`)) {
      deleteMutation.mutate(box.id);
    }
  };

  const handleEdit = (box: BuyBox) => {
    setEditingBox(box);
    setShowDialog(true);
  };

  const formatCurrency = (value?: number) => {
    if (!value) return '-';
    return `$${value.toLocaleString()}`;
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 600 }}>
            Buy Boxes
          </Typography>
          <Typography variant="body2" color="textSecondary">
            {enabledCount} of {boxes.length} active
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => {
            setEditingBox(null);
            setShowDialog(true);
          }}
        >
          Add Buy Box
        </Button>
      </Box>

      {!!error && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Unable to connect to backend. Showing demo data.
        </Alert>
      )}

      <Grid container spacing={3}>
        {boxes.map((box) => (
          <Grid item xs={12} md={6} lg={4} key={box.id}>
            <Card
              sx={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                opacity: box.enabled ? 1 : 0.7,
                border: box.enabled ? '2px solid' : '1px solid',
                borderColor: box.enabled ? 'primary.main' : 'divider',
              }}
            >
              <CardContent sx={{ flexGrow: 1 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                  <Box>
                    <Typography variant="h6" sx={{ fontWeight: 600 }}>
                      {box.name}
                    </Typography>
                    <Typography variant="body2" color="textSecondary">
                      {box.fundName}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Chip
                      label={`P${box.priority}`}
                      size="small"
                      color={box.priority <= 3 ? 'error' : box.priority <= 6 ? 'warning' : 'default'}
                    />
                    <Switch
                      checked={box.enabled}
                      onChange={() => handleToggle(box)}
                      size="small"
                    />
                  </Box>
                </Box>

                {box.description && (
                  <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
                    {box.description}
                  </Typography>
                )}

                {/* Quick Info */}
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 2 }}>
                  {box.criteria.states?.map((state) => (
                    <Chip key={state} label={state} size="small" variant="outlined" />
                  ))}
                  {box.autoSubmit && (
                    <Chip
                      label={`Auto: ${box.autoSubmitThreshold}%`}
                      size="small"
                      color="success"
                      variant="outlined"
                    />
                  )}
                </Box>

                {/* Contact Info */}
                <Box sx={{ display: 'flex', gap: 2, mb: 1 }}>
                  {box.contactEmail && (
                    <Tooltip title={box.contactEmail}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <EmailIcon fontSize="small" color="action" />
                        <Typography variant="caption" noWrap sx={{ maxWidth: 120 }}>
                          {box.contactEmail}
                        </Typography>
                      </Box>
                    </Tooltip>
                  )}
                  {box.contactPhone && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <PhoneIcon fontSize="small" color="action" />
                      <Typography variant="caption">{box.contactPhone}</Typography>
                    </Box>
                  )}
                </Box>

                {/* Expandable Details */}
                <Button
                  size="small"
                  onClick={() => setExpandedId(expandedId === box.id ? null : box.id)}
                  endIcon={expandedId === box.id ? <CollapseIcon /> : <ExpandIcon />}
                >
                  {expandedId === box.id ? 'Hide Details' : 'Show Details'}
                </Button>

                <Collapse in={expandedId === box.id}>
                  <Divider sx={{ my: 1 }} />
                  <Box sx={{ mt: 1 }}>
                    <Typography variant="caption" color="textSecondary" display="block">
                      <LocationIcon fontSize="inherit" sx={{ verticalAlign: 'middle', mr: 0.5 }} />
                      States: {box.criteria.states?.join(', ') || 'Any'}
                    </Typography>
                    <Typography variant="caption" color="textSecondary" display="block">
                      <MoneyIcon fontSize="inherit" sx={{ verticalAlign: 'middle', mr: 0.5 }} />
                      Price: {formatCurrency(box.criteria.minPrice)} - {formatCurrency(box.criteria.maxPrice)}
                    </Typography>
                    <Typography variant="caption" color="textSecondary" display="block">
                      Property Types: {box.criteria.propertyTypes?.join(', ') || 'Any'}
                    </Typography>
                    <Typography variant="caption" color="textSecondary" display="block">
                      Beds: {box.criteria.minBedrooms || 'Any'}+ | Baths: {box.criteria.minBathrooms || 'Any'}+
                    </Typography>
                    <Typography variant="caption" color="textSecondary" display="block">
                      Sqft: {box.criteria.minSqft?.toLocaleString() || 'Any'}+ | Year: {box.criteria.minYearBuilt || 'Any'}+
                    </Typography>
                  </Box>
                </Collapse>
              </CardContent>

              <CardActions sx={{ justifyContent: 'flex-end', px: 2, pb: 2 }}>
                <IconButton size="small" onClick={() => handleEdit(box)}>
                  <EditIcon fontSize="small" />
                </IconButton>
                <IconButton size="small" color="error" onClick={() => handleDelete(box)}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </CardActions>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Add/Edit Dialog */}
      <Dialog
        open={showDialog}
        onClose={() => setShowDialog(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          {editingBox ? 'Edit Buy Box' : 'Add Buy Box'}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Buy Box Name"
                defaultValue={editingBox?.name || ''}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Fund Name"
                defaultValue={editingBox?.fundName || ''}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Description"
                multiline
                rows={2}
                defaultValue={editingBox?.description || ''}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Contact Email"
                defaultValue={editingBox?.contactEmail || ''}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Contact Phone"
                defaultValue={editingBox?.contactPhone || ''}
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                label="Priority"
                type="number"
                defaultValue={editingBox?.priority || 5}
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <FormControlLabel
                control={<Switch defaultChecked={editingBox?.enabled ?? true} />}
                label="Enabled"
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <FormControlLabel
                control={<Switch defaultChecked={editingBox?.autoSubmit || false} />}
                label="Auto Submit"
              />
            </Grid>
            <Grid item xs={12}>
              <Divider sx={{ my: 1 }} />
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Criteria
              </Typography>
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="States (comma separated)"
                defaultValue={editingBox?.criteria.states?.join(', ') || ''}
                helperText="e.g., TX, GA, FL"
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Property Types"
                defaultValue={editingBox?.criteria.propertyTypes?.join(', ') || ''}
                helperText="e.g., Single Family, Townhouse"
              />
            </Grid>
            <Grid item xs={6} md={3}>
              <TextField
                fullWidth
                label="Min Price"
                type="number"
                defaultValue={editingBox?.criteria.minPrice || ''}
              />
            </Grid>
            <Grid item xs={6} md={3}>
              <TextField
                fullWidth
                label="Max Price"
                type="number"
                defaultValue={editingBox?.criteria.maxPrice || ''}
              />
            </Grid>
            <Grid item xs={6} md={3}>
              <TextField
                fullWidth
                label="Min Beds"
                type="number"
                defaultValue={editingBox?.criteria.minBedrooms || ''}
              />
            </Grid>
            <Grid item xs={6} md={3}>
              <TextField
                fullWidth
                label="Min Baths"
                type="number"
                defaultValue={editingBox?.criteria.minBathrooms || ''}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={() => setShowDialog(false)}>
            {editingBox ? 'Save Changes' : 'Create Buy Box'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default BuyBoxes;
