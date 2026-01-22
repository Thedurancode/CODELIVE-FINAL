import React from 'react';
import { useQuery } from 'react-query';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  LinearProgress,
  Chip,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Paper,
  Skeleton,
  Alert,
} from '@mui/material';
import {
  TrendingUp as TrendingUpIcon,
  Home as HomeIcon,
  AccountBalance as BuyBoxIcon,
  CheckCircle as CheckIcon,
  Cancel as CancelIcon,
  Schedule as PendingIcon,
} from '@mui/icons-material';
import { dashboardApi, DashboardStats } from '../services/api';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  color: string;
  loading?: boolean;
}

const StatCard: React.FC<StatCardProps> = ({ title, value, subtitle, icon, color, loading }) => (
  <Card sx={{ height: '100%' }}>
    <CardContent>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <Box>
          <Typography color="textSecondary" variant="body2" gutterBottom>
            {title}
          </Typography>
          {loading ? (
            <Skeleton width={60} height={40} />
          ) : (
            <Typography variant="h4" sx={{ fontWeight: 600, color }}>
              {value}
            </Typography>
          )}
          {subtitle && (
            <Typography variant="caption" color="textSecondary">
              {subtitle}
            </Typography>
          )}
        </Box>
        <Box
          sx={{
            p: 1,
            borderRadius: 2,
            bgcolor: `${color}20`,
            color,
          }}
        >
          {icon}
        </Box>
      </Box>
    </CardContent>
  </Card>
);

const Dashboard: React.FC = () => {
  const navigate = useNavigate();

  const { data: stats, isLoading, error } = useQuery<DashboardStats>(
    'dashboardStats',
    dashboardApi.getStats,
    {
      refetchInterval: 30000,
      retry: 1,
      onError: () => {},
    }
  );

  // Fallback stats for demo
  const demoStats: DashboardStats = {
    totalDeals: 45,
    newDeals: 12,
    reviewingDeals: 8,
    submittedDeals: 15,
    acceptedDeals: 7,
    rejectedDeals: 3,
    activeBuyBoxes: 13,
    totalBuyBoxes: 17,
    avgMatchScore: 67.5,
    topMatches: [
      { dealId: 1, address: '123 Oak St, Dallas, TX', score: 89, buyBox: 'Blackstone SFR' },
      { dealId: 2, address: '456 Pine Ave, Atlanta, GA', score: 85, buyBox: 'Pretium Partners' },
      { dealId: 3, address: '789 Maple Dr, Phoenix, AZ', score: 82, buyBox: 'AMH Portfolio' },
    ],
    recentDeals: [],
    dealsByState: { TX: 15, GA: 10, FL: 8, AZ: 7, NC: 5 },
  };

  const displayStats = stats || demoStats;

  if (error && !stats) {
    return (
      <Box>
        <Alert severity="info" sx={{ mb: 3 }}>
          Unable to connect to backend. Showing demo data.
        </Alert>
        <DashboardContent stats={demoStats} loading={false} navigate={navigate} />
      </Box>
    );
  }

  return <DashboardContent stats={displayStats} loading={isLoading} navigate={navigate} />;
};

interface DashboardContentProps {
  stats: DashboardStats;
  loading: boolean;
  navigate: (path: string) => void;
}

const DashboardContent: React.FC<DashboardContentProps> = ({ stats, loading, navigate }) => (
  <Box>
    <Typography variant="h4" sx={{ mb: 3, fontWeight: 600 }}>
      Dashboard
    </Typography>

    {/* Stats Cards */}
    <Grid container spacing={3} sx={{ mb: 4 }}>
      <Grid item xs={12} sm={6} md={3}>
        <StatCard
          title="Total Deals"
          value={stats.totalDeals}
          subtitle={`${stats.newDeals} new today`}
          icon={<HomeIcon />}
          color="#1976d2"
          loading={loading}
        />
      </Grid>
      <Grid item xs={12} sm={6} md={3}>
        <StatCard
          title="Active Buy Boxes"
          value={stats.activeBuyBoxes}
          subtitle={`of ${stats.totalBuyBoxes} total`}
          icon={<BuyBoxIcon />}
          color="#9c27b0"
          loading={loading}
        />
      </Grid>
      <Grid item xs={12} sm={6} md={3}>
        <StatCard
          title="Avg Match Score"
          value={`${stats.avgMatchScore.toFixed(1)}%`}
          subtitle="across all deals"
          icon={<TrendingUpIcon />}
          color="#2e7d32"
          loading={loading}
        />
      </Grid>
      <Grid item xs={12} sm={6} md={3}>
        <StatCard
          title="Accepted"
          value={stats.acceptedDeals}
          subtitle={`${stats.rejectedDeals} rejected`}
          icon={<CheckIcon />}
          color="#ed6c02"
          loading={loading}
        />
      </Grid>
    </Grid>

    {/* Pipeline Overview */}
    <Grid container spacing={3} sx={{ mb: 4 }}>
      <Grid item xs={12} md={8}>
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
            Pipeline Overview
          </Typography>
          <Grid container spacing={2}>
            {[
              { label: 'New', value: stats.newDeals, color: '#1976d2', icon: <PendingIcon /> },
              { label: 'Reviewing', value: stats.reviewingDeals, color: '#ed6c02', icon: <PendingIcon /> },
              { label: 'Submitted', value: stats.submittedDeals, color: '#9c27b0', icon: <PendingIcon /> },
              { label: 'Accepted', value: stats.acceptedDeals, color: '#2e7d32', icon: <CheckIcon /> },
              { label: 'Rejected', value: stats.rejectedDeals, color: '#d32f2f', icon: <CancelIcon /> },
            ].map((stage) => (
              <Grid item xs={12} sm={6} md={2.4} key={stage.label}>
                <Box
                  sx={{
                    p: 2,
                    borderRadius: 2,
                    bgcolor: `${stage.color}10`,
                    border: `1px solid ${stage.color}30`,
                    textAlign: 'center',
                    cursor: 'pointer',
                    '&:hover': { bgcolor: `${stage.color}20` },
                  }}
                  onClick={() => navigate(`/deals?status=${stage.label.toLowerCase()}`)}
                >
                  <Typography variant="h5" sx={{ fontWeight: 600, color: stage.color }}>
                    {loading ? <Skeleton width={40} sx={{ mx: 'auto' }} /> : stage.value}
                  </Typography>
                  <Typography variant="body2" color="textSecondary">
                    {stage.label}
                  </Typography>
                </Box>
              </Grid>
            ))}
          </Grid>
        </Paper>
      </Grid>

      <Grid item xs={12} md={4}>
        <Paper sx={{ p: 3, height: '100%' }}>
          <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
            Deals by State
          </Typography>
          {Object.entries(stats.dealsByState)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 5)
            .map(([state, count]) => (
              <Box key={state} sx={{ mb: 1.5 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography variant="body2">{state}</Typography>
                  <Typography variant="body2" fontWeight={600}>
                    {count}
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={(count / Math.max(...Object.values(stats.dealsByState))) * 100}
                  sx={{ height: 6, borderRadius: 3 }}
                />
              </Box>
            ))}
        </Paper>
      </Grid>
    </Grid>

    {/* Top Matches */}
    <Grid container spacing={3}>
      <Grid item xs={12} md={6}>
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
            Top Scoring Matches
          </Typography>
          <List disablePadding>
            {stats.topMatches.map((match, index) => (
              <ListItem
                key={match.dealId}
                sx={{
                  px: 0,
                  borderBottom: index < stats.topMatches.length - 1 ? '1px solid' : 'none',
                  borderColor: 'divider',
                  cursor: 'pointer',
                  '&:hover': { bgcolor: 'action.hover' },
                }}
                onClick={() => navigate(`/deals/${match.dealId}`)}
              >
                <ListItemText
                  primary={match.address}
                  secondary={match.buyBox}
                  primaryTypographyProps={{ fontWeight: 500 }}
                />
                <ListItemSecondaryAction>
                  <Chip
                    label={`${match.score}%`}
                    color={match.score >= 80 ? 'success' : match.score >= 60 ? 'warning' : 'default'}
                    size="small"
                  />
                </ListItemSecondaryAction>
              </ListItem>
            ))}
          </List>
        </Paper>
      </Grid>

      <Grid item xs={12} md={6}>
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
            Quick Actions
          </Typography>
          <Grid container spacing={2}>
            {[
              { label: 'Add New Deal', path: '/deals/new', color: '#1976d2' },
              { label: 'View Pipeline', path: '/pipeline', color: '#9c27b0' },
              { label: 'Manage Buy Boxes', path: '/buyboxes', color: '#ed6c02' },
              { label: 'Test Scoring', path: '/scoring', color: '#2e7d32' },
            ].map((action) => (
              <Grid item xs={6} key={action.label}>
                <Box
                  sx={{
                    p: 2,
                    borderRadius: 2,
                    bgcolor: `${action.color}10`,
                    border: `1px solid ${action.color}30`,
                    textAlign: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    '&:hover': {
                      bgcolor: `${action.color}20`,
                      transform: 'translateY(-2px)',
                    },
                  }}
                  onClick={() => navigate(action.path)}
                >
                  <Typography variant="body2" sx={{ fontWeight: 500, color: action.color }}>
                    {action.label}
                  </Typography>
                </Box>
              </Grid>
            ))}
          </Grid>
        </Paper>
      </Grid>
    </Grid>
  </Box>
);

export default Dashboard;
