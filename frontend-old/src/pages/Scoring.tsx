import React, { useState } from 'react';
import { useMutation, useQuery } from 'react-query';
import {
  Box,
  Grid,
  Paper,
  Typography,
  TextField,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  LinearProgress,
  Alert,
  Divider,
  Card,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material';
import {
  Assessment as ScoreIcon,
  ExpandMore as ExpandIcon,
  CheckCircle as PassIcon,
  Cancel as FailIcon,
} from '@mui/icons-material';
import { scoringApi, buyBoxesApi, ScoringResult, Deal } from '../services/api';

const Scoring: React.FC = () => {
  const [testDeal, setTestDeal] = useState<Partial<Deal>>({
    propertyType: 'Single Family',
    address: {
      street: '',
      city: '',
      state: 'TX',
      zipCode: '',
    },
    askingPrice: 250000,
    arv: 320000,
    bedrooms: 3,
    bathrooms: 2,
    squareFeet: 1800,
    yearBuilt: 2000,
  });
  const [results, setResults] = useState<ScoringResult[]>([]);
  const [selectedBuyBoxes, setSelectedBuyBoxes] = useState<string[]>([]);

  const { data: buyBoxes } = useQuery('buyBoxes', buyBoxesApi.getAll, {
    retry: 1,
    onError: () => {},
  });

  const scoreMutation = useMutation(
    () => scoringApi.testDeal(testDeal, selectedBuyBoxes.length > 0 ? selectedBuyBoxes : undefined),
    {
      onSuccess: (data) => {
        setResults(data.results);
      },
    }
  );

  // Demo results for fallback
  const demoResults: ScoringResult[] = [
    {
      buyBoxId: '1',
      buyBoxName: 'Texas SFR Portfolio',
      fundName: 'Blackstone SFR',
      totalScore: 87,
      matchPercentage: 87,
      breakdown: {
        geographic: { score: 100, weight: 20, details: 'State match: TX' },
        price: { score: 90, weight: 20, details: 'Within range: $150K-$400K' },
        propertyType: { score: 100, weight: 15, details: 'Single Family match' },
        bedrooms: { score: 100, weight: 10, details: 'Meets minimum: 3+' },
        bathrooms: { score: 100, weight: 10, details: 'Meets minimum: 2+' },
        sqft: { score: 100, weight: 10, details: 'Meets minimum: 1400+' },
        yearBuilt: { score: 80, weight: 10, details: 'Year 2000 vs 1990 minimum' },
      },
      hardNos: [],
      isMatch: true,
    },
    {
      buyBoxId: '2',
      buyBoxName: 'Southeast Value-Add',
      fundName: 'Pretium Partners',
      totalScore: 45,
      matchPercentage: 45,
      breakdown: {
        geographic: { score: 0, weight: 25, details: 'State TX not in target: GA, NC, SC, FL' },
        price: { score: 80, weight: 20, details: 'Within range: $100K-$300K' },
        propertyType: { score: 100, weight: 15, details: 'Single Family match' },
        bedrooms: { score: 100, weight: 10, details: 'Meets minimum: 3+' },
      },
      hardNos: ['State not in target markets'],
      isMatch: false,
    },
    {
      buyBoxId: '3',
      buyBoxName: 'Phoenix Metro',
      fundName: 'AMH Portfolio',
      totalScore: 30,
      matchPercentage: 30,
      breakdown: {
        geographic: { score: 0, weight: 30, details: 'State TX not in target: AZ' },
        price: { score: 70, weight: 20, details: 'Within range: $200K-$450K' },
        propertyType: { score: 100, weight: 15, details: 'Single Family match' },
        yearBuilt: { score: 100, weight: 10, details: 'Meets minimum: 2000+' },
      },
      hardNos: ['State not in target markets'],
      isMatch: false,
    },
  ];

  const handleChange = (field: string, value: any) => {
    if (field.startsWith('address.')) {
      const addressField = field.replace('address.', '');
      setTestDeal({
        ...testDeal,
        address: {
          ...testDeal.address!,
          [addressField]: value,
        },
      });
    } else {
      setTestDeal({
        ...testDeal,
        [field]: value,
      });
    }
  };

  const handleScore = () => {
    scoreMutation.mutate();
  };

  const displayResults = results.length > 0 ? results : (scoreMutation.isError ? demoResults : []);

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 3, fontWeight: 600 }}>
        Scoring Test
      </Typography>

      <Grid container spacing={3}>
        {/* Test Deal Form */}
        <Grid item xs={12} md={5}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
              Test Deal Properties
            </Typography>

            <Grid container spacing={2}>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Street Address"
                  value={testDeal.address?.street || ''}
                  onChange={(e) => handleChange('address.street', e.target.value)}
                />
              </Grid>
              <Grid item xs={6}>
                <TextField
                  fullWidth
                  label="City"
                  value={testDeal.address?.city || ''}
                  onChange={(e) => handleChange('address.city', e.target.value)}
                />
              </Grid>
              <Grid item xs={3}>
                <FormControl fullWidth>
                  <InputLabel>State</InputLabel>
                  <Select
                    value={testDeal.address?.state || ''}
                    label="State"
                    onChange={(e) => handleChange('address.state', e.target.value)}
                  >
                    {['TX', 'GA', 'FL', 'AZ', 'NC', 'SC', 'TN', 'AL', 'OH', 'IN'].map((state) => (
                      <MenuItem key={state} value={state}>{state}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={3}>
                <TextField
                  fullWidth
                  label="Zip"
                  value={testDeal.address?.zipCode || ''}
                  onChange={(e) => handleChange('address.zipCode', e.target.value)}
                />
              </Grid>

              <Grid item xs={12}>
                <Divider sx={{ my: 1 }} />
              </Grid>

              <Grid item xs={6}>
                <FormControl fullWidth>
                  <InputLabel>Property Type</InputLabel>
                  <Select
                    value={testDeal.propertyType || ''}
                    label="Property Type"
                    onChange={(e) => handleChange('propertyType', e.target.value)}
                  >
                    <MenuItem value="Single Family">Single Family</MenuItem>
                    <MenuItem value="Townhouse">Townhouse</MenuItem>
                    <MenuItem value="Condo">Condo</MenuItem>
                    <MenuItem value="Multi-Family">Multi-Family</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={6}>
                <TextField
                  fullWidth
                  label="Asking Price"
                  type="number"
                  value={testDeal.askingPrice || ''}
                  onChange={(e) => handleChange('askingPrice', parseInt(e.target.value))}
                  InputProps={{ startAdornment: '$' }}
                />
              </Grid>
              <Grid item xs={6}>
                <TextField
                  fullWidth
                  label="ARV"
                  type="number"
                  value={testDeal.arv || ''}
                  onChange={(e) => handleChange('arv', parseInt(e.target.value))}
                  InputProps={{ startAdornment: '$' }}
                />
              </Grid>
              <Grid item xs={3}>
                <TextField
                  fullWidth
                  label="Beds"
                  type="number"
                  value={testDeal.bedrooms || ''}
                  onChange={(e) => handleChange('bedrooms', parseInt(e.target.value))}
                />
              </Grid>
              <Grid item xs={3}>
                <TextField
                  fullWidth
                  label="Baths"
                  type="number"
                  value={testDeal.bathrooms || ''}
                  onChange={(e) => handleChange('bathrooms', parseFloat(e.target.value))}
                />
              </Grid>
              <Grid item xs={6}>
                <TextField
                  fullWidth
                  label="Square Feet"
                  type="number"
                  value={testDeal.squareFeet || ''}
                  onChange={(e) => handleChange('squareFeet', parseInt(e.target.value))}
                />
              </Grid>
              <Grid item xs={6}>
                <TextField
                  fullWidth
                  label="Year Built"
                  type="number"
                  value={testDeal.yearBuilt || ''}
                  onChange={(e) => handleChange('yearBuilt', parseInt(e.target.value))}
                />
              </Grid>

              <Grid item xs={12}>
                <Divider sx={{ my: 1 }} />
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  Filter Buy Boxes (optional)
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  {(buyBoxes || []).map((box) => (
                    <Chip
                      key={box.id}
                      label={box.name}
                      onClick={() => {
                        if (selectedBuyBoxes.includes(box.id)) {
                          setSelectedBuyBoxes(selectedBuyBoxes.filter((id) => id !== box.id));
                        } else {
                          setSelectedBuyBoxes([...selectedBuyBoxes, box.id]);
                        }
                      }}
                      color={selectedBuyBoxes.includes(box.id) ? 'primary' : 'default'}
                      variant={selectedBuyBoxes.includes(box.id) ? 'filled' : 'outlined'}
                    />
                  ))}
                </Box>
              </Grid>

              <Grid item xs={12}>
                <Button
                  fullWidth
                  variant="contained"
                  size="large"
                  startIcon={<ScoreIcon />}
                  onClick={handleScore}
                  disabled={scoreMutation.isLoading}
                >
                  {scoreMutation.isLoading ? 'Scoring...' : 'Score Against Buy Boxes'}
                </Button>
              </Grid>
            </Grid>
          </Paper>
        </Grid>

        {/* Results */}
        <Grid item xs={12} md={7}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
              Scoring Results
            </Typography>

            {scoreMutation.isLoading && (
              <Box sx={{ py: 4 }}>
                <LinearProgress />
                <Typography align="center" sx={{ mt: 2 }} color="textSecondary">
                  Scoring deal against all active buy boxes...
                </Typography>
              </Box>
            )}

            {scoreMutation.isError && (
              <Alert severity="info" sx={{ mb: 2 }}>
                Unable to connect to backend. Showing demo results.
              </Alert>
            )}

            {displayResults.length > 0 && (
              <Box>
                {displayResults
                  .sort((a, b) => b.matchPercentage - a.matchPercentage)
                  .map((result) => (
                    <Accordion key={result.buyBoxId} defaultExpanded={result.matchPercentage >= 70}>
                      <AccordionSummary expandIcon={<ExpandIcon />}>
                        <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', gap: 2 }}>
                          {result.isMatch ? (
                            <PassIcon color="success" />
                          ) : (
                            <FailIcon color="error" />
                          )}
                          <Box sx={{ flexGrow: 1 }}>
                            <Typography fontWeight={600}>{result.buyBoxName}</Typography>
                            <Typography variant="caption" color="textSecondary">
                              {result.fundName}
                            </Typography>
                          </Box>
                          <Chip
                            label={`${result.matchPercentage.toFixed(0)}%`}
                            color={
                              result.matchPercentage >= 70
                                ? 'success'
                                : result.matchPercentage >= 50
                                ? 'warning'
                                : 'error'
                            }
                            sx={{ fontWeight: 600 }}
                          />
                        </Box>
                      </AccordionSummary>
                      <AccordionDetails>
                        <LinearProgress
                          variant="determinate"
                          value={result.matchPercentage}
                          sx={{ height: 8, borderRadius: 4, mb: 2 }}
                          color={
                            result.matchPercentage >= 70
                              ? 'success'
                              : result.matchPercentage >= 50
                              ? 'warning'
                              : 'error'
                          }
                        />

                        {result.hardNos.length > 0 && (
                          <Alert severity="error" sx={{ mb: 2 }}>
                            <Typography variant="subtitle2">Hard NOs:</Typography>
                            {result.hardNos.map((no, i) => (
                              <Typography key={i} variant="body2">
                                - {no}
                              </Typography>
                            ))}
                          </Alert>
                        )}

                        <Typography variant="subtitle2" sx={{ mb: 1 }}>
                          Score Breakdown:
                        </Typography>
                        <Grid container spacing={1}>
                          {Object.entries(result.breakdown).map(([key, data]) => (
                            <Grid item xs={12} sm={6} key={key}>
                              <Card variant="outlined" sx={{ p: 1 }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                  <Typography variant="body2" sx={{ textTransform: 'capitalize' }}>
                                    {key}
                                  </Typography>
                                  <Typography variant="body2" fontWeight={600}>
                                    {data.score}%
                                  </Typography>
                                </Box>
                                <Typography variant="caption" color="textSecondary">
                                  Weight: {data.weight}% | {data.details}
                                </Typography>
                              </Card>
                            </Grid>
                          ))}
                        </Grid>
                      </AccordionDetails>
                    </Accordion>
                  ))}
              </Box>
            )}

            {!scoreMutation.isLoading && displayResults.length === 0 && (
              <Box sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
                <ScoreIcon sx={{ fontSize: 48, mb: 2, opacity: 0.5 }} />
                <Typography>
                  Enter deal properties and click "Score" to see matching buy boxes
                </Typography>
              </Box>
            )}
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default Scoring;
