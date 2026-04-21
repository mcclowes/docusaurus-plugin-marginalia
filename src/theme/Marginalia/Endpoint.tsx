import React from 'react';
import type { HttpMethod } from '../../types';
import styles from './styles.module.css';

export type EndpointProps = {
  method?: HttpMethod;
  path?: string;
  children?: React.ReactNode;
};

export default function Endpoint({ method = 'GET', path, children }: EndpointProps): JSX.Element {
  const upper = method.toUpperCase();
  return (
    <span className={styles.endpoint} data-method={upper}>
      <span className={styles.endpointMethod}>{upper}</span>
      <span className={styles.endpointPath}>{path ?? children}</span>
    </span>
  );
}
