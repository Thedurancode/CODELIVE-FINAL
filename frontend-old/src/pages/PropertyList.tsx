import React, { useState, useEffect } from 'react';
import {
  Container,
  Typography,
  Button,
  Box,
  Fab,
  Dialog,
  DialogTitle,
  DialogContent,
  Snackbar,
  Alert,
  Tabs,
  Tab,
  Paper,
} from '@mui/material';
import { Add as AddIcon, Storage as StorageIcon } from '@mui/icons-material';
import { DataGrid, GridColDef } from '@mui/x-data-grid';
import { propertyService } from '../services/propertyService';
import { Property } from '../types';
import PropertyForm from '../components/PropertyForm';
import DatabaseStatus from '../components/DatabaseStatus';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`simple-tabpanel-${index}`}
      aria-labelledby={`simple-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

const PropertyList: React.FC = () => {
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [openDialog, setOpenDialog] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: '',
    severity: 'success' as 'success' | 'error',
  });
  const [tabValue, setTabValue] = useState(0);

  useEffect(() => {
    fetchProperties();
  }, []);

  const fetchProperties = async () => {
    try {
      const data = await propertyService.getAllProperties();
      setProperties(data);
    } catch (error) {
      console.error('Error fetching properties:', error);
      setSnackbar({
        open: true,
        message: 'Error fetching properties',
        severity: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    setSelectedProperty(null);
    setOpenDialog(true);
  };

  const handleEdit = (property: Property) => {
    setSelectedProperty(property);
    setOpenDialog(true);
  };

  const handleDelete = async (id: number) => {
    if (window.confirm('Are you sure you want to delete this property?')) {
      try {
        await propertyService.deleteProperty(id);
        setSnackbar({
          open: true,
          message: 'Property deleted successfully',
          severity: 'success',
        });
        fetchProperties();
      } catch (error) {
        console.error('Error deleting property:', error);
        setSnackbar({
          open: true,
          message: 'Error deleting property',
          severity: 'error',
        });
      }
    }
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setSelectedProperty(null);
  };

  const handleSave = () => {
    setOpenDialog(false);
    setSelectedProperty(null);
    fetchProperties();
  };

  const columns: GridColDef[] = [
    { field: 'id', headerName: 'ID', width: 70 },
    { field: 'propertyId', headerName: 'Property ID', width: 150 },
    { field: 'propertyType', headerName: 'Property Type', width: 150 },
    {
      field: 'address',
      headerName: 'Address',
      width: 250,
      valueGetter: (params) => {
        const addr = params.row.address;
        return `${addr.houseNumber} ${addr.street}`;
      },
    },
    { field: 'city', headerName: 'City', width: 120 },
    { field: 'state', headerName: 'State', width: 80 },
    { field: 'zip', headerName: 'Zip', width: 100 },
    { field: 'bedroomCount', headerName: 'Bedrooms', width: 100 },
    { field: 'bathroomCount', headerName: 'Bathrooms', width: 100 },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 150,
      renderCell: (params) => (
        <Box>
          <Button
            size="small"
            onClick={() => handleEdit(params.row)}
            style={{ marginRight: 8 }}
          >
            Edit
          </Button>
          <Button
            size="small"
            color="error"
            onClick={() => handleDelete(params.row.id)}
          >
            Delete
          </Button>
        </Box>
      ),
    },
  ];

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        Dispotree Property Management
      </Typography>

      <Paper sx={{ width: '100%', mb: 3 }}>
        <Tabs
          value={tabValue}
          onChange={handleTabChange}
          aria-label="property management tabs"
        >
          <Tab label="Properties" />
          <Tab icon={<StorageIcon />} iconPosition="start" label="Database Status" />
        </Tabs>
      </Paper>

      <TabPanel value={tabValue} index={0}>
        <Box sx={{ height: 600, width: '100%' }}>
          <DataGrid
            rows={properties}
            columns={columns}
            loading={loading}
            pageSizeOptions={[10, 25, 50]}
            pagination
            getRowId={(row: any) => row.id}
          />
        </Box>
      </TabPanel>

      <TabPanel value={tabValue} index={1}>
        <DatabaseStatus />
      </TabPanel>

      <Fab
        color="primary"
        aria-label="add"
        onClick={handleAdd}
        sx={{ position: 'fixed', bottom: 16, right: 16 }}
      >
        <AddIcon />
      </Fab>

      <Dialog
        open={openDialog}
        onClose={handleCloseDialog}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          {selectedProperty ? 'Edit Property' : 'Add New Property'}
        </DialogTitle>
        <DialogContent>
          <PropertyForm
            property={selectedProperty}
            onSave={handleSave}
            onCancel={handleCloseDialog}
          />
        </DialogContent>
      </Dialog>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
      >
        <Alert
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          severity={snackbar.severity}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Container>
  );
};

export default PropertyList;