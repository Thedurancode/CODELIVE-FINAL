import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Chip,
  Alert,
  CircularProgress,
} from '@mui/material';
import {
  Storage as DatabaseIcon,
  TableChart as TableIcon,
  CheckCircle as CheckIcon,
  Error as ErrorIcon,
} from '@mui/icons-material';

interface DatabaseStats {
  isConnected: boolean;
  propertyCount: number;
  userCount: number;
  tables: string[];
}

const DatabaseStatus: React.FC = () => {
  const [stats, setStats] = useState<DatabaseStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDatabaseStatus();
  }, []);

  const fetchDatabaseStatus = async () => {
    try {
      // In a real app, this would be an API endpoint
      // For now, we'll simulate the status
      setTimeout(() => {
        setStats({
          isConnected: true,
          propertyCount: 2,
          userCount: 1,
          tables: ['properties', 'users'],
        });
        setLoading(false);
      }, 1000);
    } catch (err) {
      setError('Failed to fetch database status');
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" p={4}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ m: 2 }}>
        {error}
      </Alert>
    );
  }

  if (!stats) {
    return null;
  }

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h5" gutterBottom>
        Database Status
      </Typography>

      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" mb={2}>
                {stats.isConnected ? (
                  <CheckIcon color="success" sx={{ mr: 1 }} />
                ) : (
                  <ErrorIcon color="error" sx={{ mr: 1 }} />
                )}
                <Typography variant="h6">
                  Connection Status
                </Typography>
              </Box>
              <Chip
                label={stats.isConnected ? 'Connected' : 'Disconnected'}
                color={stats.isConnected ? 'success' : 'error'}
              />
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" mb={2}>
                <TableIcon sx={{ mr: 1, color: 'primary.main' }} />
                <Typography variant="h6">
                  Data Overview
                </Typography>
              </Box>
              <Typography color="textSecondary">
                Properties: {stats.propertyCount}
              </Typography>
              <Typography color="textSecondary">
                Users: {stats.userCount}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" mb={2}>
                <DatabaseIcon sx={{ mr: 1, color: 'info.main' }} />
                <Typography variant="h6">
                  Database Tables
                </Typography>
              </Box>
              <Box display="flex" flexWrap="wrap" gap={1}>
                {stats.tables.map((table) => (
                  <Chip
                    key={table}
                    label={table}
                    variant="outlined"
                    size="small"
                  />
                ))}
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default DatabaseStatus;