import React, { useState } from 'react';
import {
  Box,
  Button,
  Grid,
  TextField,
  FormControl,
  FormControlLabel,
  Checkbox,
  Select,
  MenuItem,
  InputLabel,
  Typography,
} from '@mui/material';
import { useForm, Controller } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { Property, PropertyFormData } from '../types';
import { propertyService } from '../services/propertyService';

const validationSchema = yup.object().shape({
  propertyId: yup.string().required('Property ID is required'),
  propertyOwnership: yup.string().required('Property ownership is required'),
  propertyType: yup.string().required('Property type is required'),
  houseNumber: yup.string().required('House number is required'),
  street: yup.string().required('Street is required'),
  city: yup.string().required('City is required'),
  state: yup.string().required('State is required'),
  zip: yup.string().required('Zip code is required'),
  county: yup.string().required('County is required'),
  occupancyStatus: yup.string().required('Occupancy status is required'),
  bedroomCount: yup.string().required('Bedroom count is required'),
  bathroomCount: yup.string().required('Bathroom count is required'),
});

interface PropertyFormProps {
  property?: Property | null;
  onSave: () => void;
  onCancel: () => void;
}

const PropertyForm: React.FC<PropertyFormProps> = ({ property, onSave, onCancel }) => {
  const [loading, setLoading] = useState(false);

  const {
    control,
    handleSubmit,
    formState: { errors },
    watch,
  } = useForm<PropertyFormData>({
    resolver: yupResolver(validationSchema) as any,
    defaultValues: property ? {
      ...property,
      houseNumber: property.address.houseNumber,
      street: property.address.street,
      monthlyRent: property.monthlyRent?.toString() || '',
      reservePrice: property.reservePrice?.toString() || '',
      mlsListingPrice: property.mlsListingPrice?.toString() || '',
      bedroomCount: property.bedroomCount.toString(),
      bathroomCount: property.bathroomCount.toString(),
      livingSpaceSqFt: property.livingSpaceSqFt?.toString() || '',
      lotSizeSqFt: property.lotSizeSqFt?.toString() || '',
      yearBuilt: property.yearBuilt?.toString() || '',
      hoaDuesAmount: property.hoaDuesAmount?.toString() || '',
      purchaseContractPrice: property.purchaseContractPrice?.toString() || '',
      purchaseContractExpiration: property.purchaseContractExpiration
        ? new Date(property.purchaseContractExpiration).toISOString().split('T')[0]
        : '',
    } : {
      propertyId: '',
      liveOnHubzu: false,
      propertyOwnership: '',
      propertyType: '',
      houseNumber: '',
      street: '',
      city: '',
      state: '',
      zip: '',
      county: '',
      occupancyStatus: '',
      monthlyRent: '',
      deliveredVacant: false,
      accessToProperty: '',
      lockboxCode: '',
      reservePrice: '',
      syndication: [],
      listedOnMLS: false,
      mlsListingPrice: '',
      bedroomCount: '',
      bathroomCount: '',
      livingSpaceSqFt: '',
      lotSizeSqFt: '',
      yearBuilt: '',
      hoa: false,
      hoaBillingFrequency: '',
      hoaDuesAmount: '',
      propertyContracts: '',
      wholesalerLlcName: '',
      llcOwnerName: '',
      llcBusinessAddress: '',
      llcOwnerEmail: '',
      purchaseContractExpiration: '',
      purchaseContractPrice: '',
      knownMaterialDefects: '',
      photoLinks: [],
      propertyListingDescription: '',
      roof: '',
      sewer: '',
      electric: '',
      water: '',
      foundationType: '',
      typeOfRehab: '',
      waterHeater: '',
      hvac: '',
    },
  });

  const onSubmit = async (data: PropertyFormData) => {
    setLoading(true);
    try {
      const formattedData = {
        ...data,
        address: {
          houseNumber: data.houseNumber,
          street: data.street,
        },
        monthlyRent: data.monthlyRent ? parseFloat(data.monthlyRent) : undefined,
        reservePrice: data.reservePrice ? parseFloat(data.reservePrice) : undefined,
        mlsListingPrice: data.mlsListingPrice ? parseFloat(data.mlsListingPrice) : undefined,
        bedroomCount: parseInt(data.bedroomCount),
        bathroomCount: parseInt(data.bathroomCount),
        livingSpaceSqFt: data.livingSpaceSqFt ? parseInt(data.livingSpaceSqFt) : undefined,
        lotSizeSqFt: data.lotSizeSqFt ? parseInt(data.lotSizeSqFt) : undefined,
        yearBuilt: data.yearBuilt ? parseInt(data.yearBuilt) : undefined,
        hoaDuesAmount: data.hoaDuesAmount ? parseFloat(data.hoaDuesAmount) : undefined,
        purchaseContractPrice: data.purchaseContractPrice ? parseFloat(data.purchaseContractPrice) : undefined,
        purchaseContractExpiration: data.purchaseContractExpiration ? new Date(data.purchaseContractExpiration) : undefined,
      };

      // Remove the temporary fields
      delete (formattedData as any).houseNumber;
      delete (formattedData as any).street;

      if (property && property.id) {
        await propertyService.updateProperty(property.id, formattedData as any);
      } else {
        await propertyService.createProperty(formattedData as any);
      }

      onSave();
    } catch (error) {
      console.error('Error saving property:', error);
    } finally {
      setLoading(false);
    }
  };

  const hoa = watch('hoa');

  return (
    <Box component="form" onSubmit={handleSubmit(onSubmit)} sx={{ mt: 2 }}>
      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Controller
            name="propertyId"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                fullWidth
                label="Property ID"
                error={!!errors.propertyId}
                helperText={errors.propertyId?.message}
              />
            )}
          />
        </Grid>

        <Grid item xs={12} md={6}>
          <Controller
            name="propertyType"
            control={control}
            render={({ field }) => (
              <FormControl fullWidth error={!!errors.propertyType}>
                <InputLabel>Property Type</InputLabel>
                <Select {...field} label="Property Type">
                  <MenuItem value="Single Family">Single Family</MenuItem>
                  <MenuItem value="Condo">Condo</MenuItem>
                  <MenuItem value="Townhouse">Townhouse</MenuItem>
                  <MenuItem value="Multi-Family">Multi-Family</MenuItem>
                  <MenuItem value="Commercial">Commercial</MenuItem>
                </Select>
              </FormControl>
            )}
          />
        </Grid>

        <Grid item xs={12}>
          <Typography variant="h6" gutterBottom>
            Address
          </Typography>
        </Grid>

        <Grid item xs={12} md={4}>
          <Controller
            name="houseNumber"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                fullWidth
                label="House Number"
                error={!!errors.houseNumber}
                helperText={errors.houseNumber?.message}
              />
            )}
          />
        </Grid>

        <Grid item xs={12} md={8}>
          <Controller
            name="street"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                fullWidth
                label="Street"
                error={!!errors.street}
                helperText={errors.street?.message}
              />
            )}
          />
        </Grid>

        <Grid item xs={12} md={3}>
          <Controller
            name="city"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                fullWidth
                label="City"
                error={!!errors.city}
                helperText={errors.city?.message}
              />
            )}
          />
        </Grid>

        <Grid item xs={12} md={3}>
          <Controller
            name="state"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                fullWidth
                label="State"
                error={!!errors.state}
                helperText={errors.state?.message}
              />
            )}
          />
        </Grid>

        <Grid item xs={12} md={3}>
          <Controller
            name="zip"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                fullWidth
                label="Zip Code"
                error={!!errors.zip}
                helperText={errors.zip?.message}
              />
            )}
          />
        </Grid>

        <Grid item xs={12} md={3}>
          <Controller
            name="county"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                fullWidth
                label="County"
                error={!!errors.county}
                helperText={errors.county?.message}
              />
            )}
          />
        </Grid>

        <Grid item xs={12} md={6}>
          <Controller
            name="bedroomCount"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                fullWidth
                label="Bedroom Count"
                type="number"
                error={!!errors.bedroomCount}
                helperText={errors.bedroomCount?.message}
              />
            )}
          />
        </Grid>

        <Grid item xs={12} md={6}>
          <Controller
            name="bathroomCount"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                fullWidth
                label="Bathroom Count"
                type="number"
                error={!!errors.bathroomCount}
                helperText={errors.bathroomCount?.message}
              />
            )}
          />
        </Grid>

        <Grid item xs={12}>
          <Controller
            name="liveOnHubzu"
            control={control}
            render={({ field }) => (
              <FormControlLabel
                control={<Checkbox {...field} checked={field.value} />}
                label="Live on Hubzu"
              />
            )}
          />
        </Grid>

        <Grid item xs={12}>
          <Controller
            name="hoa"
            control={control}
            render={({ field }) => (
              <FormControlLabel
                control={<Checkbox {...field} checked={field.value} />}
                label="HOA"
              />
            )}
          />
        </Grid>

        {hoa && (
          <>
            <Grid item xs={12} md={6}>
              <Controller
                name="hoaBillingFrequency"
                control={control}
                render={({ field }) => (
                  <FormControl fullWidth>
                    <InputLabel>HOA Billing Frequency</InputLabel>
                    <Select {...field} label="HOA Billing Frequency">
                      <MenuItem value="Monthly">Monthly</MenuItem>
                      <MenuItem value="Quarterly">Quarterly</MenuItem>
                      <MenuItem value="Annually">Annually</MenuItem>
                    </Select>
                  </FormControl>
                )}
              />
            </Grid>

            <Grid item xs={12} md={6}>
              <Controller
                name="hoaDuesAmount"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    fullWidth
                    label="HOA Dues Amount"
                    type="number"
                  />
                )}
              />
            </Grid>
          </>
        )}

        <Grid item xs={12}>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2, mt: 3 }}>
            <Button onClick={onCancel} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" variant="contained" disabled={loading}>
              {loading ? 'Saving...' : property ? 'Update' : 'Create'}
            </Button>
          </Box>
        </Grid>
      </Grid>
    </Box>
  );
};

export default PropertyForm;