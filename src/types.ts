export type MarginaliaOptions = {
  /**
   * Whether the plugin is enabled. Defaults to true.
   */
  enabled?: boolean;
};

export type AsideKind =
  | 'note'
  | 'concept'
  | 'warning'
  | 'info'
  | 'link'
  | 'value'
  | 'code'
  | 'endpoint';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | (string & {});
