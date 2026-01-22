import React, { useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Switch,
  FormControlLabel,
  Grid,
  Divider,
  Alert,
  Chip,
  Card,
  CardContent,
  IconButton,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material';
import {
  Save as SaveIcon,
  Refresh as RefreshIcon,
  CheckCircle as ConnectedIcon,
  Error as DisconnectedIcon,
  ExpandMore as ExpandIcon,
  Visibility as ShowIcon,
  VisibilityOff as HideIcon,
} from '@mui/icons-material';

interface ConnectionStatus {
  name: string;
  connected: boolean;
  lastChecked?: string;
}

const Settings: React.FC = () => {
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState(false);

  // Demo connection statuses
  const connections: ConnectionStatus[] = [
    { name: 'PostgreSQL Database', connected: true, lastChecked: 'Just now' },
    { name: 'Pinecone Vector DB', connected: true, lastChecked: 'Just now' },
    { name: 'OpenAI API', connected: true, lastChecked: 'Just now' },
    { name: 'Zillow API', connected: false, lastChecked: '5 min ago' },
    { name: 'Email Server (IMAP)', connected: false, lastChecked: 'Never' },
  ];

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const toggleSecret = (key: string) => {
    setShowSecrets({ ...showSecrets, [key]: !showSecrets[key] });
  };

  const SecretField = ({ label, defaultValue, fieldKey }: { label: string; defaultValue: string; fieldKey: string }) => (
    <TextField
      fullWidth
      label={label}
      type={showSecrets[fieldKey] ? 'text' : 'password'}
      defaultValue={defaultValue}
      InputProps={{
        endAdornment: (
          <IconButton onClick={() => toggleSecret(fieldKey)} size="small">
            {showSecrets[fieldKey] ? <HideIcon /> : <ShowIcon />}
          </IconButton>
        ),
      }}
    />
  );

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" sx={{ fontWeight: 600 }}>
          Settings
        </Typography>
        <Button
          variant="contained"
          startIcon={<SaveIcon />}
          onClick={handleSave}
        >
          Save Changes
        </Button>
      </Box>

      {saved && (
        <Alert severity="success" sx={{ mb: 3 }}>
          Settings saved successfully!
        </Alert>
      )}

      {/* Connection Status */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6" fontWeight={600}>
            Connection Status
          </Typography>
          <Button size="small" startIcon={<RefreshIcon />}>
            Refresh
          </Button>
        </Box>
        <Grid container spacing={2}>
          {connections.map((conn) => (
            <Grid item xs={12} sm={6} md={4} key={conn.name}>
              <Card variant="outlined">
                <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {conn.connected ? (
                      <ConnectedIcon color="success" fontSize="small" />
                    ) : (
                      <DisconnectedIcon color="error" fontSize="small" />
                    )}
                    <Box sx={{ flexGrow: 1 }}>
                      <Typography variant="body2" fontWeight={500}>
                        {conn.name}
                      </Typography>
                      <Typography variant="caption" color="textSecondary">
                        {conn.lastChecked}
                      </Typography>
                    </Box>
                    <Chip
                      label={conn.connected ? 'Connected' : 'Disconnected'}
                      size="small"
                      color={conn.connected ? 'success' : 'error'}
                      variant="outlined"
                    />
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Paper>

      {/* API Keys */}
      <Accordion defaultExpanded>
        <AccordionSummary expandIcon={<ExpandIcon />}>
          <Typography variant="h6" fontWeight={600}>
            API Keys & Credentials
          </Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <Typography variant="subtitle2" color="textSecondary" sx={{ mb: 2 }}>
                OpenAI Configuration
              </Typography>
            </Grid>
            <Grid item xs={12} md={6}>
              <SecretField label="OpenAI API Key" defaultValue="sk-...abcd" fieldKey="openai" />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField fullWidth label="Model" defaultValue="gpt-4-turbo" />
            </Grid>

            <Grid item xs={12}>
              <Divider sx={{ my: 2 }} />
              <Typography variant="subtitle2" color="textSecondary" sx={{ mb: 2 }}>
                Pinecone Configuration
              </Typography>
            </Grid>
            <Grid item xs={12} md={6}>
              <SecretField label="Pinecone API Key" defaultValue="pc-...xyz" fieldKey="pinecone" />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField fullWidth label="Index Name" defaultValue="dispotree" />
            </Grid>

            <Grid item xs={12}>
              <Divider sx={{ my: 2 }} />
              <Typography variant="subtitle2" color="textSecondary" sx={{ mb: 2 }}>
                Zillow API (Optional)
              </Typography>
            </Grid>
            <Grid item xs={12} md={6}>
              <SecretField label="RapidAPI Key" defaultValue="" fieldKey="zillow" />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField fullWidth label="API Endpoint" defaultValue="zillow-com1.p.rapidapi.com" />
            </Grid>
          </Grid>
        </AccordionDetails>
      </Accordion>

      {/* Email Configuration */}
      <Accordion>
        <AccordionSummary expandIcon={<ExpandIcon />}>
          <Typography variant="h6" fontWeight={600}>
            Email Ingestion
          </Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <FormControlLabel
                control={<Switch defaultChecked={false} />}
                label="Enable Email Ingestion"
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField fullWidth label="IMAP Server" defaultValue="" placeholder="imap.gmail.com" />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField fullWidth label="IMAP Port" defaultValue="993" />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField fullWidth label="Email Address" defaultValue="" placeholder="deals@company.com" />
            </Grid>
            <Grid item xs={12} md={6}>
              <SecretField label="Email Password / App Password" defaultValue="" fieldKey="email" />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Allowed Sender Domains"
                defaultValue=""
                placeholder="wholesaler1.com, investor2.com"
                helperText="Comma-separated list of trusted sender domains"
              />
            </Grid>
          </Grid>
        </AccordionDetails>
      </Accordion>

      {/* Scoring Configuration */}
      <Accordion>
        <AccordionSummary expandIcon={<ExpandIcon />}>
          <Typography variant="h6" fontWeight={600}>
            Scoring Settings
          </Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <FormControlLabel
                control={<Switch defaultChecked />}
                label="Use Pinecone Pre-filtering"
              />
              <Typography variant="caption" color="textSecondary" display="block">
                Filter buy boxes using semantic search before scoring
              </Typography>
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                label="Default Match Threshold"
                type="number"
                defaultValue="60"
                helperText="Minimum % to consider a match"
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                label="Pre-filter Top K"
                type="number"
                defaultValue="10"
                helperText="Max buy boxes to score per deal"
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                label="Auto-Submit Delay (seconds)"
                type="number"
                defaultValue="300"
                helperText="Wait time before auto-submitting"
              />
            </Grid>
          </Grid>
        </AccordionDetails>
      </Accordion>

      {/* Notifications */}
      <Accordion>
        <AccordionSummary expandIcon={<ExpandIcon />}>
          <Typography variant="h6" fontWeight={600}>
            Notifications
          </Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <FormControlLabel
                control={<Switch defaultChecked />}
                label="Email notifications for new deals"
              />
            </Grid>
            <Grid item xs={12}>
              <FormControlLabel
                control={<Switch defaultChecked />}
                label="Email notifications for high-score matches (>80%)"
              />
            </Grid>
            <Grid item xs={12}>
              <FormControlLabel
                control={<Switch defaultChecked={false} />}
                label="Slack notifications"
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Notification Email Recipients"
                defaultValue=""
                placeholder="team@company.com, manager@company.com"
                helperText="Comma-separated list of email addresses"
              />
            </Grid>
          </Grid>
        </AccordionDetails>
      </Accordion>

      {/* Database */}
      <Accordion>
        <AccordionSummary expandIcon={<ExpandIcon />}>
          <Typography variant="h6" fontWeight={600}>
            Database
          </Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <TextField fullWidth label="Database Host" defaultValue="localhost" />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField fullWidth label="Database Port" defaultValue="5432" />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField fullWidth label="Database Name" defaultValue="dispotree" />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField fullWidth label="Database User" defaultValue="postgres" />
            </Grid>
            <Grid item xs={12} md={6}>
              <SecretField label="Database Password" defaultValue="password" fieldKey="db" />
            </Grid>
            <Grid item xs={12} md={6}>
              <FormControlLabel
                control={<Switch defaultChecked />}
                label="SSL Connection"
              />
            </Grid>
          </Grid>
        </AccordionDetails>
      </Accordion>
    </Box>
  );
};

export default Settings;
