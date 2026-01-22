'use client';

import { useState, memo } from 'react';
import { ComposableMap, Geographies, Geography } from 'react-simple-maps';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, Building2, Phone, Mail } from 'lucide-react';
import type { BrokerProfile } from '@/hooks/use-broker';

// US TopoJSON - this is a public URL for US states
const GEO_URL = 'https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json';

// State FIPS codes to abbreviations
const FIPS_TO_STATE: Record<string, string> = {
  '01': 'AL', '02': 'AK', '04': 'AZ', '05': 'AR', '06': 'CA',
  '08': 'CO', '09': 'CT', '10': 'DE', '11': 'DC', '12': 'FL',
  '13': 'GA', '15': 'HI', '16': 'ID', '17': 'IL', '18': 'IN',
  '19': 'IA', '20': 'KS', '21': 'KY', '22': 'LA', '23': 'ME',
  '24': 'MD', '25': 'MA', '26': 'MI', '27': 'MN', '28': 'MS',
  '29': 'MO', '30': 'MT', '31': 'NE', '32': 'NV', '33': 'NH',
  '34': 'NJ', '35': 'NM', '36': 'NY', '37': 'NC', '38': 'ND',
  '39': 'OH', '40': 'OK', '41': 'OR', '42': 'PA', '44': 'RI',
  '45': 'SC', '46': 'SD', '47': 'TN', '48': 'TX', '49': 'UT',
  '50': 'VT', '51': 'VA', '53': 'WA', '54': 'WV', '55': 'WI',
  '56': 'WY', '72': 'PR',
};

const STATE_NAMES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'Washington DC', FL: 'Florida',
  GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana',
  IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine',
  MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi',
  MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire',
  NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota',
  OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island',
  SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah',
  VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin',
  WY: 'Wyoming', PR: 'Puerto Rico',
};

interface USBrokerMapProps {
  approvedBrokers: BrokerProfile[];
  onStateClick?: (state: string, brokers: BrokerProfile[]) => void;
}

export const USBrokerMap = memo(function USBrokerMap({ approvedBrokers, onStateClick }: USBrokerMapProps) {
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [hoveredState, setHoveredState] = useState<string | null>(null);

  // Create a map of states to brokers (using licensedStates for multi-state coverage)
  const stateBrokerMap = new Map<string, BrokerProfile[]>();
  approvedBrokers.forEach((broker) => {
    // Use licensedStates if available, otherwise fall back to the primary licenseState
    const states = broker.licensedStates?.length
      ? broker.licensedStates
      : [broker.licenseState];

    states.forEach((state) => {
      const stateCode = state.toUpperCase();
      if (!stateBrokerMap.has(stateCode)) {
        stateBrokerMap.set(stateCode, []);
      }
      // Avoid duplicates if broker is already added for this state
      if (!stateBrokerMap.get(stateCode)!.some((b) => b.id === broker.id)) {
        stateBrokerMap.get(stateCode)!.push(broker);
      }
    });
  });

  const coveredStates = new Set(stateBrokerMap.keys());

  const handleStateClick = (stateCode: string) => {
    setSelectedState(stateCode);
    setDialogOpen(true);
    if (onStateClick) {
      onStateClick(stateCode, stateBrokerMap.get(stateCode) || []);
    }
  };

  const selectedBrokers = selectedState ? stateBrokerMap.get(selectedState) || [] : [];
  const selectedStateName = selectedState ? STATE_NAMES[selectedState] || selectedState : '';
  const hoveredStateName = hoveredState ? STATE_NAMES[hoveredState] : null;
  const hoveredBrokerCount = hoveredState ? stateBrokerMap.get(hoveredState)?.length || 0 : 0;

  return (
    <>
      <div className="relative w-full bg-gradient-to-b from-zinc-900 to-zinc-950 rounded-2xl border border overflow-hidden">
        {/* Header Stats */}
        <div className="absolute top-4 left-4 z-10">
          <div className="bg-card/90 backdrop-blur-sm rounded-lg px-4 py-3 border border">
            <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Coverage</p>
            <p className="text-foreground">
              <span className="text-3xl font-bold text-green-500">{coveredStates.size}</span>
              <span className="text-muted-foreground text-lg"> / 50</span>
            </p>
          </div>
        </div>

        {/* Legend */}
        <div className="absolute top-4 right-4 z-10">
          <div className="bg-card/90 backdrop-blur-sm rounded-lg px-4 py-3 border border">
            <div className="flex flex-col gap-2 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-green-500 shadow-lg shadow-green-500/30" />
                <span className="text-foreground">Covered</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-red-500/70 shadow-lg shadow-red-500/20" />
                <span className="text-foreground">No Coverage</span>
              </div>
            </div>
          </div>
        </div>

        {/* Hovered State Info */}
        {hoveredState && (
          <div className="absolute bottom-4 left-4 z-10">
            <div className="bg-card/95 backdrop-blur-sm rounded-lg px-4 py-3 border border">
              <p className="text-foreground font-medium">{hoveredStateName}</p>
              <p className={hoveredBrokerCount > 0 ? 'text-green-400 text-sm' : 'text-red-400 text-sm'}>
                {hoveredBrokerCount > 0
                  ? `${hoveredBrokerCount} broker${hoveredBrokerCount > 1 ? 's' : ''}`
                  : 'No coverage'}
              </p>
            </div>
          </div>
        )}

        {/* Map */}
        <div className="h-[600px]">
          <ComposableMap
            projection="geoAlbersUsa"
            className="w-full h-full"
          >
            <Geographies geography={GEO_URL}>
              {({ geographies }) =>
                geographies.map((geo) => {
                  const fips = geo.id;
                  const stateCode = FIPS_TO_STATE[fips];
                  const hasBroker = stateCode && coveredStates.has(stateCode);

                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      onMouseEnter={() => stateCode && setHoveredState(stateCode)}
                      onMouseLeave={() => setHoveredState(null)}
                      onClick={() => stateCode && handleStateClick(stateCode)}
                      style={{
                        default: {
                          fill: hasBroker
                            ? 'rgb(34, 197, 94)'
                            : 'rgb(185, 28, 28)',
                          stroke: hasBroker
                            ? 'rgb(22, 163, 74)'
                            : 'rgb(127, 29, 29)',
                          strokeWidth: 0.5,
                          outline: 'none',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                        },
                        hover: {
                          fill: hasBroker
                            ? 'rgb(74, 222, 128)'
                            : 'rgb(239, 68, 68)',
                          stroke: '#fff',
                          strokeWidth: 1.5,
                          outline: 'none',
                          cursor: 'pointer',
                        },
                        pressed: {
                          fill: hasBroker
                            ? 'rgb(21, 128, 61)'
                            : 'rgb(153, 27, 27)',
                          stroke: '#fff',
                          strokeWidth: 1.5,
                          outline: 'none',
                        },
                      }}
                    />
                  );
                })
              }
            </Geographies>
          </ComposableMap>
        </div>

        {/* Help text */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10">
          <p className="text-muted-foreground text-xs bg-card/80 px-3 py-1 rounded-full">
            Click a state to view broker details
          </p>
        </div>
      </div>

      {/* State Detail Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-card border max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              {selectedBrokers.length > 0 ? (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              ) : (
                <XCircle className="h-5 w-5 text-red-500" />
              )}
              {selectedStateName}
              <Badge
                variant="outline"
                className={
                  selectedBrokers.length > 0
                    ? 'border-green-500 text-green-500 ml-2'
                    : 'border-red-500 text-red-500 ml-2'
                }
              >
                {selectedState}
              </Badge>
            </DialogTitle>
          </DialogHeader>

          <div className="py-4">
            {selectedBrokers.length > 0 ? (
              <div className="space-y-4">
                <p className="text-muted-foreground text-sm">
                  {selectedBrokers.length} approved broker{selectedBrokers.length > 1 ? 's' : ''} in this state
                </p>
                <div className="space-y-3 max-h-80 overflow-y-auto">
                  {selectedBrokers.map((broker) => {
                    const brokerStates = broker.licensedStates?.length
                      ? broker.licensedStates
                      : [broker.licenseState];
                    return (
                      <div
                        key={broker.id}
                        className="bg-secondary/50 rounded-lg p-4 border border hover:border transition-colors"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <h4 className="text-foreground font-medium flex items-center gap-2">
                              <Building2 className="h-4 w-4 text-green-500" />
                              {broker.brokerageCompany}
                            </h4>
                            <p className="text-muted-foreground text-sm mt-1">
                              License: {broker.licenseNumber}
                            </p>
                          </div>
                          <Badge className="bg-green-500/10 text-green-500 border-green-500/20">
                            Active
                          </Badge>
                        </div>
                        {/* Show all states this broker covers */}
                        {brokerStates.length > 1 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {brokerStates.map((state) => (
                              <Badge
                                key={state}
                                variant="outline"
                                className={
                                  state === selectedState
                                    ? 'border-green-500 text-green-500 text-xs'
                                    : 'border text-muted-foreground text-xs'
                                }
                              >
                                {state}
                              </Badge>
                            ))}
                          </div>
                        )}
                        <div className="mt-3 flex flex-wrap gap-4 text-sm text-muted-foreground">
                          {broker.brokeragePhone && (
                            <span className="flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              {broker.brokeragePhone}
                            </span>
                          )}
                          {broker.brokerageEmail && (
                            <span className="flex items-center gap-1">
                              <Mail className="h-3 w-3" />
                              {broker.brokerageEmail}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
                  <XCircle className="h-8 w-8 text-red-500" />
                </div>
                <p className="text-foreground font-medium mb-2">No Coverage in {selectedStateName}</p>
                <p className="text-muted-foreground text-sm">
                  Consider recruiting licensed brokers in this state to expand your coverage area.
                </p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
});
