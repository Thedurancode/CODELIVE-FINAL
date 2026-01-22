import axios from 'axios';
import { Property, PropertyFormData } from '../types';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

const propertyApi = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const propertyService = {
  // Get all properties
  getAllProperties: async (): Promise<Property[]> => {
    const response = await propertyApi.get('/listings');
    return response.data;
  },

  // Get property by ID
  getPropertyById: async (id: number): Promise<Property> => {
    const response = await propertyApi.get(`/listings/${id}`);
    return response.data;
  },

  // Create new property
  createProperty: async (propertyData: PropertyFormData): Promise<Property> => {
    const response = await propertyApi.post('/listings', propertyData);
    return response.data;
  },

  // Update property
  updateProperty: async (id: number, propertyData: Partial<PropertyFormData>): Promise<Property> => {
    const response = await propertyApi.put(`/listings/${id}`, propertyData);
    return response.data;
  },

  // Delete property
  deleteProperty: async (id: number): Promise<void> => {
    await propertyApi.delete(`/listings/${id}`);
  },
};