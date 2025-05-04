// src/components/CameraSelector.jsx
import React from 'react';
import styled from 'styled-components';
import { Camera } from 'lucide-react';

const SelectorButton = styled.button`
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 10;
  background: rgba(0, 0, 0, 0.6);
  color: white;
  border: none;
  border-radius: 4px;
  padding: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 14px;
  transition: background-color 0.2s;

  &:hover {
    background: rgba(0, 0, 0, 0.8);
  }
`;

const SelectorPanel = styled.div`
  position: absolute;
  top: 50px;
  right: 10px;
  z-index: 20;
  background: rgba(0, 0, 0, 0.8);
  padding: 12px;
  border-radius: 4px;
  color: white;
  max-width: 300px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
`;

const DeviceList = styled.ul`
  margin: 0;
  padding: 0;
  list-style: none;
`;

const DeviceItem = styled.li`
  padding: 8px;
  margin: 4px 0;
  background-color: ${props => props.$isSelected ? '#3f51b5' : '#2c2c2c'};
  border-radius: 3px;
  cursor: pointer;
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: background-color 0.2s;

  &:hover {
    background-color: ${props => props.$isSelected ? '#3f51b5' : '#444444'};
  }
`;

const Title = styled.h3`
  margin: 0 0 8px 0;
  font-size: 14px;
  font-weight: 500;
`;

const NoDevicesMessage = styled.div`
  padding: 8px;
  color: #aaa;
  font-style: italic;
`;

const CameraSelector = ({ devices, selectedDeviceId, onSelect, showSelector, toggleSelector }) => {
  // Don't render the component if there's only one or no cameras
  if (!devices || devices.length <= 1) return null;

  return (
    <>
      <SelectorButton onClick={toggleSelector}>
        <Camera size={16} /> {showSelector ? 'Hide Cameras' : 'Select Camera'}
      </SelectorButton>
      
      {showSelector && (
        <SelectorPanel>
          <Title>Select Camera:</Title>
          
          {devices.length > 0 ? (
            <DeviceList>
              {devices.map(device => (
                <DeviceItem 
                  key={device.deviceId}
                  $isSelected={selectedDeviceId === device.deviceId}
                  onClick={() => onSelect(device.deviceId)}
                  title={device.label || `Camera ${devices.indexOf(device) + 1}`}
                >
                  {device.label || `Camera ${devices.indexOf(device) + 1}`}
                  {selectedDeviceId === device.deviceId && ' ✓'}
                </DeviceItem>
              ))}
            </DeviceList>
          ) : (
            <NoDevicesMessage>No cameras found</NoDevicesMessage>
          )}
        </SelectorPanel>
      )}
    </>
  );
};

export default CameraSelector;
