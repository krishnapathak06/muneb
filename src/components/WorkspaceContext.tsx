'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

export type ActivityRecord = any; // Will use same structure as LiveTracker

interface WorkspaceContextType {
  workspaceName: string | null;
  setWorkspaceName: (name: string | null) => void;
  workspaceStatus: string | null;
  setWorkspaceStatus: (status: string | null) => void;
  activities: ActivityRecord[];
  setActivities: (activities: ActivityRecord[]) => void;
  expandedActivityId: string | null;
  setExpandedActivityId: (id: string | null) => void;
  
  // Dashboard states
  countries: { id: string; name: string }[];
  setCountries: (countries: { id: string; name: string }[]) => void;
  subIssues: { id: string; title: string }[];
  setSubIssues: (subIssues: { id: string; title: string }[]) => void;
  selectedCountryId: string | null;
  setSelectedCountryId: (id: string | null) => void;
  selectedTopicId: string | null;
  setSelectedTopicId: (id: string | null) => void;
  viewMode: 'research' | 'live';
  setViewMode: (mode: 'research' | 'live') => void;
  
  // Navigation trigger to scroll/highlight
  triggerScrollToActivityId: string | null;
  setTriggerScrollToActivityId: (id: string | null) => void;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [workspaceName, setWorkspaceName] = useState<string | null>(null);
  const [workspaceStatus, setWorkspaceStatus] = useState<string | null>(null);
  const [activities, setActivities] = useState<ActivityRecord[]>([]);
  const [expandedActivityId, setExpandedActivityId] = useState<string | null>(null);
  const [countries, setCountries] = useState<{ id: string; name: string }[]>([]);
  const [subIssues, setSubIssues] = useState<{ id: string; title: string }[]>([]);
  const [selectedCountryId, setSelectedCountryId] = useState<string | null>(null);
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'research' | 'live'>('research');
  const [triggerScrollToActivityId, setTriggerScrollToActivityId] = useState<string | null>(null);

  // Clear sub-page contexts when workspaceName is reset (e.g. going back home)
  useEffect(() => {
    if (!workspaceName) {
      setActivities([]);
      setExpandedActivityId(null);
      setCountries([]);
      setSubIssues([]);
      setSelectedCountryId(null);
      setSelectedTopicId('overview');
      setViewMode('research');
      setTriggerScrollToActivityId(null);
    }
  }, [workspaceName]);

  return (
    <WorkspaceContext.Provider
      value={{
        workspaceName,
        setWorkspaceName,
        workspaceStatus,
        setWorkspaceStatus,
        activities,
        setActivities,
        expandedActivityId,
        setExpandedActivityId,
        countries,
        setCountries,
        subIssues,
        setSubIssues,
        selectedCountryId,
        setSelectedCountryId,
        selectedTopicId,
        setSelectedTopicId,
        viewMode,
        setViewMode,
        triggerScrollToActivityId,
        setTriggerScrollToActivityId,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return context;
}
