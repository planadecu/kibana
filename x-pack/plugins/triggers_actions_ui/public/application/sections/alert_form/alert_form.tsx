/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { Fragment, useState, useEffect, useCallback, Suspense } from 'react';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiTextColor,
  EuiTitle,
  EuiForm,
  EuiSpacer,
  EuiFieldText,
  EuiFieldSearch,
  EuiFlexGrid,
  EuiFormRow,
  EuiComboBox,
  EuiFieldNumber,
  EuiSelect,
  EuiIconTip,
  EuiButtonIcon,
  EuiHorizontalRule,
  EuiEmptyPrompt,
  EuiListGroupItem,
  EuiListGroup,
  EuiLink,
  EuiText,
  EuiNotificationBadge,
  EuiErrorBoundary,
  EuiToolTip,
  EuiCallOut,
} from '@elastic/eui';
import { capitalize } from 'lodash';
import { KibanaFeature } from '../../../../../features/public';
import {
  getDurationNumberInItsUnit,
  getDurationUnitValue,
} from '../../../../../alerting/common/parse_duration';
import { loadAlertTypes } from '../../lib/alert_api';
import { AlertReducerAction, InitialAlert } from './alert_reducer';
import {
  RuleTypeModel,
  Rule,
  IErrorObject,
  AlertAction,
  RuleTypeIndex,
  RuleType,
  RuleTypeRegistryContract,
  ActionTypeRegistryContract,
} from '../../../types';
import { getTimeOptions } from '../../../common/lib/get_time_options';
import { ActionForm } from '../action_connector_form';
import {
  AlertActionParam,
  ALERTS_FEATURE_ID,
  RecoveredActionGroup,
  isActionGroupDisabledForActionTypeId,
} from '../../../../../alerting/common';
import { hasAllPrivilege, hasShowActionsCapability } from '../../lib/capabilities';
import { SolutionFilter } from './solution_filter';
import './alert_form.scss';
import { useKibana } from '../../../common/lib/kibana';
import { recoveredActionGroupMessage } from '../../constants';
import { getDefaultsForActionParams } from '../../lib/get_defaults_for_action_params';
import { IsEnabledResult, IsDisabledResult } from '../../lib/check_alert_type_enabled';
import { AlertNotifyWhen } from './alert_notify_when';
import { checkAlertTypeEnabled } from '../../lib/check_alert_type_enabled';
import { alertTypeCompare, alertTypeGroupCompare } from '../../lib/alert_type_compare';
import { VIEW_LICENSE_OPTIONS_LINK } from '../../../common/constants';
import { SectionLoading } from '../../components/section_loading';
import { DEFAULT_ALERT_INTERVAL } from '../../constants';

const ENTER_KEY = 13;

function getProducerFeatureName(producer: string, kibanaFeatures: KibanaFeature[]) {
  return kibanaFeatures.find((featureItem) => featureItem.id === producer)?.name;
}

interface AlertFormProps<MetaData = Record<string, any>> {
  alert: InitialAlert;
  dispatch: React.Dispatch<AlertReducerAction>;
  errors: IErrorObject;
  ruleTypeRegistry: RuleTypeRegistryContract;
  actionTypeRegistry: ActionTypeRegistryContract;
  operation: string;
  canChangeTrigger?: boolean; // to hide Change trigger button
  setHasActionsDisabled?: (value: boolean) => void;
  setHasActionsWithBrokenConnector?: (value: boolean) => void;
  metadata?: MetaData;
}

const defaultScheduleInterval = getDurationNumberInItsUnit(DEFAULT_ALERT_INTERVAL);
const defaultScheduleIntervalUnit = getDurationUnitValue(DEFAULT_ALERT_INTERVAL);

export const AlertForm = ({
  alert,
  canChangeTrigger = true,
  dispatch,
  errors,
  setHasActionsDisabled,
  setHasActionsWithBrokenConnector,
  operation,
  ruleTypeRegistry,
  actionTypeRegistry,
  metadata,
}: AlertFormProps) => {
  const {
    http,
    notifications: { toasts },
    docLinks,
    application: { capabilities },
    kibanaFeatures,
    charts,
    data,
  } = useKibana().services;
  const canShowActions = hasShowActionsCapability(capabilities);

  const [alertTypeModel, setAlertTypeModel] = useState<RuleTypeModel | null>(null);

  const [alertInterval, setAlertInterval] = useState<number | undefined>(
    alert.schedule.interval
      ? getDurationNumberInItsUnit(alert.schedule.interval)
      : defaultScheduleInterval
  );
  const [alertIntervalUnit, setAlertIntervalUnit] = useState<string>(
    alert.schedule.interval
      ? getDurationUnitValue(alert.schedule.interval)
      : defaultScheduleIntervalUnit
  );
  const [alertThrottle, setAlertThrottle] = useState<number | null>(
    alert.throttle ? getDurationNumberInItsUnit(alert.throttle) : null
  );
  const [alertThrottleUnit, setAlertThrottleUnit] = useState<string>(
    alert.throttle ? getDurationUnitValue(alert.throttle) : 'h'
  );
  const [defaultActionGroupId, setDefaultActionGroupId] = useState<string | undefined>(undefined);
  const [ruleTypeIndex, setRuleTypeIndex] = useState<RuleTypeIndex | null>(null);

  const [availableAlertTypes, setAvailableAlertTypes] = useState<
    Array<{ alertTypeModel: RuleTypeModel; alertType: RuleType }>
  >([]);
  const [filteredAlertTypes, setFilteredAlertTypes] = useState<
    Array<{ alertTypeModel: RuleTypeModel; alertType: RuleType }>
  >([]);
  const [searchText, setSearchText] = useState<string | undefined>();
  const [inputText, setInputText] = useState<string | undefined>();
  const [solutions, setSolutions] = useState<Map<string, string> | undefined>(undefined);
  const [solutionsFilter, setSolutionFilter] = useState<string[]>([]);
  let hasDisabledByLicenseAlertTypes: boolean = false;

  // load alert types
  useEffect(() => {
    (async () => {
      try {
        const alertTypesResult = await loadAlertTypes({ http });
        const index: RuleTypeIndex = new Map();
        for (const alertTypeItem of alertTypesResult) {
          index.set(alertTypeItem.id, alertTypeItem);
        }
        if (alert.alertTypeId && index.has(alert.alertTypeId)) {
          setDefaultActionGroupId(index.get(alert.alertTypeId)!.defaultActionGroupId);
        }
        setRuleTypeIndex(index);

        const availableAlertTypesResult = getAvailableAlertTypes(alertTypesResult);
        setAvailableAlertTypes(availableAlertTypesResult);

        const solutionsResult = availableAlertTypesResult.reduce(
          (result: Map<string, string>, alertTypeItem) => {
            if (!result.has(alertTypeItem.alertType.producer)) {
              result.set(
                alertTypeItem.alertType.producer,
                (kibanaFeatures
                  ? getProducerFeatureName(alertTypeItem.alertType.producer, kibanaFeatures)
                  : capitalize(alertTypeItem.alertType.producer)) ??
                  capitalize(alertTypeItem.alertType.producer)
              );
            }
            return result;
          },
          new Map()
        );
        setSolutions(
          new Map([...solutionsResult.entries()].sort(([, a], [, b]) => a.localeCompare(b)))
        );
      } catch (e) {
        toasts.addDanger({
          title: i18n.translate(
            'xpack.triggersActionsUI.sections.alertForm.unableToLoadRuleTypesMessage',
            { defaultMessage: 'Unable to load rule types' }
          ),
        });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setAlertTypeModel(alert.alertTypeId ? ruleTypeRegistry.get(alert.alertTypeId) : null);
    if (alert.alertTypeId && ruleTypeIndex && ruleTypeIndex.has(alert.alertTypeId)) {
      setDefaultActionGroupId(ruleTypeIndex.get(alert.alertTypeId)!.defaultActionGroupId);
    }
  }, [alert, alert.alertTypeId, ruleTypeIndex, ruleTypeRegistry]);

  useEffect(() => {
    if (alert.schedule.interval) {
      const interval = getDurationNumberInItsUnit(alert.schedule.interval);
      const intervalUnit = getDurationUnitValue(alert.schedule.interval);

      if (interval !== defaultScheduleInterval) {
        setAlertInterval(interval);
      }
      if (intervalUnit !== defaultScheduleIntervalUnit) {
        setAlertIntervalUnit(intervalUnit);
      }
    }
  }, [alert.schedule.interval]);

  const setRuleProperty = useCallback(
    <Key extends keyof Rule>(key: Key, value: Rule[Key] | null) => {
      dispatch({ command: { type: 'setProperty' }, payload: { key, value } });
    },
    [dispatch]
  );

  const setActions = useCallback(
    (updatedActions: AlertAction[]) => setRuleProperty('actions', updatedActions),
    [setRuleProperty]
  );

  const setRuleParams = (key: string, value: any) => {
    dispatch({ command: { type: 'setRuleParams' }, payload: { key, value } });
  };

  const setScheduleProperty = (key: string, value: any) => {
    dispatch({ command: { type: 'setScheduleProperty' }, payload: { key, value } });
  };

  const setActionProperty = <Key extends keyof AlertAction>(
    key: Key,
    value: AlertAction[Key] | null,
    index: number
  ) => {
    dispatch({ command: { type: 'setAlertActionProperty' }, payload: { key, value, index } });
  };

  const setActionParamsProperty = useCallback(
    (key: string, value: AlertActionParam, index: number) => {
      dispatch({ command: { type: 'setAlertActionParams' }, payload: { key, value, index } });
    },
    [dispatch]
  );

  useEffect(() => {
    const searchValue = searchText ? searchText.trim().toLocaleLowerCase() : null;
    setFilteredAlertTypes(
      availableAlertTypes
        .filter((alertTypeItem) =>
          solutionsFilter.length > 0
            ? solutionsFilter.find((item) => alertTypeItem.alertType!.producer === item)
            : alertTypeItem
        )
        .filter((alertTypeItem) =>
          searchValue
            ? alertTypeItem.alertType.name.toString().toLocaleLowerCase().includes(searchValue) ||
              alertTypeItem.alertType!.producer.toLocaleLowerCase().includes(searchValue) ||
              alertTypeItem.alertTypeModel.description.toLocaleLowerCase().includes(searchValue)
            : alertTypeItem
        )
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ruleTypeRegistry, availableAlertTypes, searchText, JSON.stringify(solutionsFilter)]);

  const getAvailableAlertTypes = (alertTypesResult: RuleType[]) =>
    ruleTypeRegistry
      .list()
      .reduce(
        (
          arr: Array<{ alertType: RuleType; alertTypeModel: RuleTypeModel }>,
          ruleTypeRegistryItem: RuleTypeModel
        ) => {
          const alertType = alertTypesResult.find((item) => ruleTypeRegistryItem.id === item.id);
          if (alertType) {
            arr.push({
              alertType,
              alertTypeModel: ruleTypeRegistryItem,
            });
          }
          return arr;
        },
        []
      )
      .filter((item) => item.alertType && hasAllPrivilege(alert, item.alertType))
      .filter((item) =>
        alert.consumer === ALERTS_FEATURE_ID
          ? !item.alertTypeModel.requiresAppContext
          : item.alertType!.producer === alert.consumer
      );
  const selectedAlertType = alert?.alertTypeId ? ruleTypeIndex?.get(alert?.alertTypeId) : undefined;
  const recoveryActionGroup = selectedAlertType?.recoveryActionGroup?.id;
  const getDefaultActionParams = useCallback(
    (actionTypeId: string, actionGroupId: string): Record<string, AlertActionParam> | undefined =>
      getDefaultsForActionParams(
        actionTypeId,
        actionGroupId,
        actionGroupId === recoveryActionGroup
      ),
    [recoveryActionGroup]
  );

  const tagsOptions = alert.tags ? alert.tags.map((label: string) => ({ label })) : [];

  const isActionGroupDisabledForActionType = useCallback(
    (alertType: RuleType, actionGroupId: string, actionTypeId: string): boolean => {
      return isActionGroupDisabledForActionTypeId(
        actionGroupId === alertType?.recoveryActionGroup?.id
          ? RecoveredActionGroup.id
          : actionGroupId,
        actionTypeId
      );
    },
    []
  );

  const AlertParamsExpressionComponent = alertTypeModel
    ? alertTypeModel.ruleParamsExpression
    : null;

  const alertTypesByProducer = filteredAlertTypes.reduce(
    (
      result: Record<
        string,
        Array<{
          id: string;
          name: string;
          checkEnabledResult: IsEnabledResult | IsDisabledResult;
          alertTypeItem: RuleTypeModel;
        }>
      >,
      alertTypeValue
    ) => {
      const producer = alertTypeValue.alertType.producer;
      if (producer) {
        const checkEnabledResult = checkAlertTypeEnabled(alertTypeValue.alertType);
        if (!checkEnabledResult.isEnabled) {
          hasDisabledByLicenseAlertTypes = true;
        }
        (result[producer] = result[producer] || []).push({
          name: alertTypeValue.alertType.name,
          id: alertTypeValue.alertTypeModel.id,
          checkEnabledResult,
          alertTypeItem: alertTypeValue.alertTypeModel,
        });
      }
      return result;
    },
    {}
  );

  const alertTypeNodes = Object.entries(alertTypesByProducer)
    .sort((a, b) => alertTypeGroupCompare(a, b, solutions))
    .map(([solution, items], groupIndex) => (
      <Fragment key={`group${groupIndex}`}>
        <EuiFlexGroup
          gutterSize="none"
          alignItems="center"
          className="triggersActionsUI__alertTypeNodeHeading"
        >
          <EuiFlexItem>
            <EuiTitle
              data-test-subj={`alertType${groupIndex}Group`}
              size="xxxs"
              textTransform="uppercase"
            >
              <EuiTextColor color="subdued">
                {(kibanaFeatures
                  ? getProducerFeatureName(solution, kibanaFeatures)
                  : capitalize(solution)) ?? capitalize(solution)}
              </EuiTextColor>
            </EuiTitle>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiNotificationBadge color="subdued">{items.length}</EuiNotificationBadge>
          </EuiFlexItem>
        </EuiFlexGroup>
        <EuiHorizontalRule size="full" margin="xs" />
        <EuiListGroup flush={true} gutterSize="m" size="l" maxWidth={false}>
          {items
            .sort((a, b) => alertTypeCompare(a, b))
            .map((item, index) => {
              const alertTypeListItemHtml = (
                <span>
                  <strong>{item.name}</strong>
                  <EuiText color="subdued" size="s">
                    <p>{item.alertTypeItem.description}</p>
                  </EuiText>
                </span>
              );
              return (
                <EuiListGroupItem
                  wrapText
                  key={index}
                  data-test-subj={`${item.id}-SelectOption`}
                  color="primary"
                  label={
                    item.checkEnabledResult.isEnabled ? (
                      alertTypeListItemHtml
                    ) : (
                      <EuiToolTip
                        position="top"
                        data-test-subj={`${item.id}-disabledTooltip`}
                        content={item.checkEnabledResult.message}
                      >
                        {alertTypeListItemHtml}
                      </EuiToolTip>
                    )
                  }
                  isDisabled={!item.checkEnabledResult.isEnabled}
                  onClick={() => {
                    setRuleProperty('alertTypeId', item.id);
                    setActions([]);
                    setAlertTypeModel(item.alertTypeItem);
                    setRuleProperty('params', {});
                    if (ruleTypeIndex && ruleTypeIndex.has(item.id)) {
                      setDefaultActionGroupId(ruleTypeIndex.get(item.id)!.defaultActionGroupId);
                    }
                  }}
                />
              );
            })}
        </EuiListGroup>
        <EuiSpacer />
      </Fragment>
    ));

  const alertTypeDetails = (
    <>
      <EuiHorizontalRule />
      <EuiFlexGroup alignItems="center" gutterSize="s">
        <EuiFlexItem>
          <EuiTitle size="s" data-test-subj="selectedAlertTypeTitle">
            <h5 id="selectedAlertTypeTitle">
              {alert.alertTypeId && ruleTypeIndex && ruleTypeIndex.has(alert.alertTypeId)
                ? ruleTypeIndex.get(alert.alertTypeId)!.name
                : ''}
            </h5>
          </EuiTitle>
        </EuiFlexItem>
        {canChangeTrigger ? (
          <EuiFlexItem grow={false}>
            <EuiButtonIcon
              iconType="cross"
              color="danger"
              aria-label={i18n.translate(
                'xpack.triggersActionsUI.sections.alertForm.changeAlertTypeAriaLabel',
                {
                  defaultMessage: 'Delete',
                }
              )}
              onClick={() => {
                setRuleProperty('alertTypeId', null);
                setAlertTypeModel(null);
                setRuleProperty('params', {});
              }}
            />
          </EuiFlexItem>
        ) : null}
      </EuiFlexGroup>
      {alertTypeModel?.description && (
        <EuiFlexGroup>
          <EuiFlexItem>
            <EuiText color="subdued" size="s" data-test-subj="alertDescription">
              {alertTypeModel.description}&nbsp;
              {alertTypeModel?.documentationUrl && (
                <EuiLink
                  external
                  target="_blank"
                  data-test-subj="alertDocumentationLink"
                  href={
                    typeof alertTypeModel.documentationUrl === 'function'
                      ? alertTypeModel.documentationUrl(docLinks)
                      : alertTypeModel.documentationUrl
                  }
                >
                  <FormattedMessage
                    id="xpack.triggersActionsUI.sections.alertForm.documentationLabel"
                    defaultMessage="Documentation"
                  />
                </EuiLink>
              )}
            </EuiText>
          </EuiFlexItem>
        </EuiFlexGroup>
      )}
      <EuiHorizontalRule />
      {AlertParamsExpressionComponent &&
      defaultActionGroupId &&
      alert.alertTypeId &&
      selectedAlertType ? (
        <EuiErrorBoundary>
          <Suspense
            fallback={
              <SectionLoading>
                <FormattedMessage
                  id="xpack.triggersActionsUI.sections.alertForm.loadingRuleTypeParamsDescription"
                  defaultMessage="Loading rule type params…"
                />
              </SectionLoading>
            }
          >
            <AlertParamsExpressionComponent
              ruleParams={alert.params}
              ruleInterval={`${alertInterval ?? 1}${alertIntervalUnit}`}
              ruleThrottle={`${alertThrottle ?? 1}${alertThrottleUnit}`}
              alertNotifyWhen={alert.notifyWhen ?? 'onActionGroupChange'}
              errors={errors}
              setRuleParams={setRuleParams}
              setRuleProperty={setRuleProperty}
              defaultActionGroupId={defaultActionGroupId}
              actionGroups={selectedAlertType.actionGroups}
              metadata={metadata}
              charts={charts}
              data={data}
            />
          </Suspense>
        </EuiErrorBoundary>
      ) : null}
      {canShowActions &&
      defaultActionGroupId &&
      alertTypeModel &&
      alert.alertTypeId &&
      selectedAlertType ? (
        <>
          {errors.actionConnectors.length >= 1 ? (
            <>
              <EuiSpacer />
              <EuiCallOut color="danger" size="s" title={errors.actionConnectors} />
              <EuiSpacer />
            </>
          ) : null}
          <ActionForm
            actions={alert.actions}
            setHasActionsDisabled={setHasActionsDisabled}
            setHasActionsWithBrokenConnector={setHasActionsWithBrokenConnector}
            messageVariables={selectedAlertType.actionVariables}
            defaultActionGroupId={defaultActionGroupId}
            isActionGroupDisabledForActionType={(actionGroupId: string, actionTypeId: string) =>
              isActionGroupDisabledForActionType(selectedAlertType, actionGroupId, actionTypeId)
            }
            actionGroups={selectedAlertType.actionGroups.map((actionGroup) =>
              actionGroup.id === selectedAlertType.recoveryActionGroup.id
                ? {
                    ...actionGroup,
                    omitMessageVariables: selectedAlertType.doesSetRecoveryContext
                      ? 'keepContext'
                      : 'all',
                    defaultActionMessage: recoveredActionGroupMessage,
                  }
                : { ...actionGroup, defaultActionMessage: alertTypeModel?.defaultActionMessage }
            )}
            getDefaultActionParams={getDefaultActionParams}
            setActionIdByIndex={(id: string, index: number) => setActionProperty('id', id, index)}
            setActionGroupIdByIndex={(group: string, index: number) =>
              setActionProperty('group', group, index)
            }
            setActions={setActions}
            setActionParamsProperty={setActionParamsProperty}
            actionTypeRegistry={actionTypeRegistry}
          />
        </>
      ) : null}
    </>
  );

  const labelForAlertChecked = (
    <>
      <FormattedMessage
        id="xpack.triggersActionsUI.sections.alertForm.checkFieldLabel"
        defaultMessage="Check every"
      />{' '}
      <EuiIconTip
        position="right"
        type="questionInCircle"
        content={i18n.translate('xpack.triggersActionsUI.sections.alertForm.checkWithTooltip', {
          defaultMessage:
            'Define how often to evaluate the condition. Checks are queued; they run as close to the defined value as capacity allows.',
        })}
      />
    </>
  );

  return (
    <EuiForm>
      <EuiFlexGrid columns={2}>
        <EuiFlexItem>
          <EuiFormRow
            fullWidth
            id="alertName"
            label={
              <FormattedMessage
                id="xpack.triggersActionsUI.sections.alertForm.alertNameLabel"
                defaultMessage="Name"
              />
            }
            isInvalid={errors.name.length > 0 && alert.name !== undefined}
            error={errors.name}
          >
            <EuiFieldText
              fullWidth
              autoFocus={true}
              isInvalid={errors.name.length > 0 && alert.name !== undefined}
              name="name"
              data-test-subj="alertNameInput"
              value={alert.name || ''}
              onChange={(e) => {
                setRuleProperty('name', e.target.value);
              }}
              onBlur={() => {
                if (!alert.name) {
                  setRuleProperty('name', '');
                }
              }}
            />
          </EuiFormRow>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiFormRow
            fullWidth
            label={i18n.translate('xpack.triggersActionsUI.sections.alertForm.tagsFieldLabel', {
              defaultMessage: 'Tags (optional)',
            })}
          >
            <EuiComboBox
              noSuggestions
              fullWidth
              data-test-subj="tagsComboBox"
              selectedOptions={tagsOptions}
              onCreateOption={(searchValue: string) => {
                const newOptions = [...tagsOptions, { label: searchValue }];
                setRuleProperty(
                  'tags',
                  newOptions.map((newOption) => newOption.label)
                );
              }}
              onChange={(selectedOptions: Array<{ label: string }>) => {
                setRuleProperty(
                  'tags',
                  selectedOptions.map((selectedOption) => selectedOption.label)
                );
              }}
              onBlur={() => {
                if (!alert.tags) {
                  setRuleProperty('tags', []);
                }
              }}
            />
          </EuiFormRow>
        </EuiFlexItem>
      </EuiFlexGrid>
      <EuiSpacer size="m" />
      <EuiFlexGrid columns={2}>
        <EuiFlexItem>
          <EuiFormRow
            fullWidth
            display="rowCompressed"
            label={labelForAlertChecked}
            isInvalid={errors.interval.length > 0}
            error={errors.interval}
          >
            <EuiFlexGroup gutterSize="s">
              <EuiFlexItem>
                <EuiFieldNumber
                  fullWidth
                  min={1}
                  isInvalid={errors.interval.length > 0}
                  value={alertInterval || ''}
                  name="interval"
                  data-test-subj="intervalInput"
                  onChange={(e) => {
                    const interval =
                      e.target.value !== '' ? parseInt(e.target.value, 10) : undefined;
                    setAlertInterval(interval);
                    setScheduleProperty('interval', `${e.target.value}${alertIntervalUnit}`);
                  }}
                />
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiSelect
                  fullWidth
                  value={alertIntervalUnit}
                  options={getTimeOptions(alertInterval ?? 1)}
                  onChange={(e) => {
                    setAlertIntervalUnit(e.target.value);
                    setScheduleProperty('interval', `${alertInterval}${e.target.value}`);
                  }}
                  data-test-subj="intervalInputUnit"
                />
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFormRow>
        </EuiFlexItem>
        <EuiFlexItem>
          <AlertNotifyWhen
            alert={alert}
            throttle={alertThrottle}
            throttleUnit={alertThrottleUnit}
            onNotifyWhenChange={useCallback(
              (notifyWhen) => {
                setRuleProperty('notifyWhen', notifyWhen);
              },
              [setRuleProperty]
            )}
            onThrottleChange={useCallback(
              (throttle: number | null, throttleUnit: string) => {
                setAlertThrottle(throttle);
                setAlertThrottleUnit(throttleUnit);
                setRuleProperty('throttle', throttle ? `${throttle}${throttleUnit}` : null);
              },
              [setRuleProperty]
            )}
          />
        </EuiFlexItem>
      </EuiFlexGrid>
      <EuiSpacer size="m" />
      {alertTypeModel ? (
        <>{alertTypeDetails}</>
      ) : availableAlertTypes.length ? (
        <>
          <EuiHorizontalRule />
          <EuiFormRow
            fullWidth
            labelAppend={
              hasDisabledByLicenseAlertTypes && (
                <EuiTitle size="xxs">
                  <EuiLink
                    href={VIEW_LICENSE_OPTIONS_LINK}
                    target="_blank"
                    external
                    className="actActionForm__getMoreActionsLink"
                  >
                    <FormattedMessage
                      defaultMessage="Get more rule types"
                      id="xpack.triggersActionsUI.sections.actionForm.getMoreRuleTypesTitle"
                    />
                  </EuiLink>
                </EuiTitle>
              )
            }
            label={
              <EuiTitle size="xxs">
                <h5>
                  <FormattedMessage
                    id="xpack.triggersActionsUI.sections.alertForm.ruleTypeSelectLabel"
                    defaultMessage="Select rule type"
                  />
                </h5>
              </EuiTitle>
            }
          >
            <EuiFlexGroup gutterSize="s">
              <EuiFlexItem>
                <EuiFieldSearch
                  fullWidth
                  data-test-subj="alertSearchField"
                  onChange={(e) => {
                    setInputText(e.target.value);
                    if (e.target.value === '') {
                      setSearchText('');
                    }
                  }}
                  onKeyUp={(e) => {
                    if (e.keyCode === ENTER_KEY) {
                      setSearchText(inputText);
                    }
                  }}
                  placeholder={i18n.translate(
                    'xpack.triggersActionsUI.sections.alertForm.searchPlaceholderTitle',
                    { defaultMessage: 'Search' }
                  )}
                />
              </EuiFlexItem>
              {solutions ? (
                <EuiFlexItem grow={false}>
                  <SolutionFilter
                    key="solution-filter"
                    solutions={solutions}
                    onChange={(selectedSolutions: string[]) => setSolutionFilter(selectedSolutions)}
                  />
                </EuiFlexItem>
              ) : null}
            </EuiFlexGroup>
          </EuiFormRow>
          <EuiSpacer />
          {errors.alertTypeId.length >= 1 && alert.alertTypeId !== undefined ? (
            <>
              <EuiSpacer />
              <EuiCallOut color="danger" size="s" title={errors.alertTypeId} />
              <EuiSpacer />
            </>
          ) : null}
          {alertTypeNodes}
        </>
      ) : ruleTypeIndex ? (
        <NoAuthorizedAlertTypes operation={operation} />
      ) : (
        <SectionLoading>
          <FormattedMessage
            id="xpack.triggersActionsUI.sections.alertForm.loadingRuleTypesDescription"
            defaultMessage="Loading rule types…"
          />
        </SectionLoading>
      )}
    </EuiForm>
  );
};

const NoAuthorizedAlertTypes = ({ operation }: { operation: string }) => (
  <EuiEmptyPrompt
    iconType="lock"
    data-test-subj="noAuthorizedAlertTypesPrompt"
    titleSize="xs"
    title={
      <h2>
        <FormattedMessage
          id="xpack.triggersActionsUI.sections.alertForm.error.noAuthorizedRuleTypesTitle"
          defaultMessage="You have not been authorized to {operation} any Rule types"
          values={{ operation }}
        />
      </h2>
    }
    body={
      <div>
        <p role="banner">
          <FormattedMessage
            id="xpack.triggersActionsUI.sections.alertForm.error.noAuthorizedRuleTypes"
            defaultMessage="In order to {operation} a Rule you need to have been granted the appropriate privileges."
            values={{ operation }}
          />
        </p>
      </div>
    }
  />
);
