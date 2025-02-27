/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/* eslint-disable react/display-name */

import { renderHook } from '@testing-library/react-hooks';
import React from 'react';
import { CasesContext } from '../../cases_context';
import { CasesContextStoreActionsList } from '../../cases_context/cases_context_reducer';
import { useCasesAddToExistingCaseModal } from './use_cases_add_to_existing_case_modal';

describe('use cases add to existing case modal hook', () => {
  const dispatch = jest.fn();
  let wrapper: React.FC;
  const defaultParams = () => {
    return { onRowClick: jest.fn() };
  };
  beforeEach(() => {
    dispatch.mockReset();
    wrapper = ({ children }) => {
      return (
        <CasesContext.Provider
          value={{
            owner: ['test'],
            userCanCrud: true,
            appId: 'test',
            appTitle: 'jest',
            basePath: '/jest',
            dispatch,
            features: { alerts: { sync: true }, metrics: [] },
          }}
        >
          {children}
        </CasesContext.Provider>
      );
    };
  });

  it('should throw if called outside of a cases context', () => {
    const { result } = renderHook(() => {
      useCasesAddToExistingCaseModal(defaultParams());
    });
    expect(result.error?.message).toContain(
      'useCasesContext must be used within a CasesProvider and have a defined value'
    );
  });

  it('should dispatch the open action when invoked', () => {
    const { result } = renderHook(
      () => {
        return useCasesAddToExistingCaseModal(defaultParams());
      },
      { wrapper }
    );
    result.current.open();
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: CasesContextStoreActionsList.OPEN_ADD_TO_CASE_MODAL,
      })
    );
  });

  it('should dispatch the close action when invoked', () => {
    const { result } = renderHook(
      () => {
        return useCasesAddToExistingCaseModal(defaultParams());
      },
      { wrapper }
    );
    result.current.close();
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: CasesContextStoreActionsList.CLOSE_ADD_TO_CASE_MODAL,
      })
    );
  });
});
