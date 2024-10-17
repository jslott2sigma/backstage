/*
 * Copyright 2022 The Backstage Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
  EntityProvider,
  EntityProviderConnection,
} from '@backstage/plugin-catalog-node';
import { LoggerService } from '@backstage/backend-plugin-api';
import { Entity, stringifyEntityRef } from '@backstage/catalog-model';
import { Router } from 'express';

export class TestEntityProvider implements EntityProvider {
  private readonly logger: LoggerService;
  private connection?: EntityProviderConnection;

  constructor(logger: LoggerService) {
    this.logger = logger.child({
      target: this.getProviderName(),
    });
  }

  getProviderName(): string {
    return 'test-provider';
  }

  async connect(connection: EntityProviderConnection): Promise<void> {
    this.connection = connection;
  }

  getRouter(): Router {
    const router = Router();
    router.post('/full', async (_req, resp) => {
      this.logger.info('Running full import from test provider');
      if (!this.connection) {
        throw new Error('Not initialized');
      }
      const owner = this.getOwner();
      const entities = [
        owner,
        this.getComponent('component-a', owner, ['component-b']),
        this.getComponent('component-b', owner, []),
        this.getComponent('component-c', owner, []),
      ].map(e => ({
        entity: e,
        location: 'http://fake.com',
      }));

      await this.connection?.applyMutation({
        type: 'full',
        entities,
      });
      return resp.status(200).send({ message: 'OK' });
    });

    router.post('/delta', async (_req, resp) => {
      this.logger.info('Running full import from test provider');
      if (!this.connection) {
        throw new Error('Not initialized');
      }
      const owner = this.getOwner();
      const entities = [
        this.getComponent('component-a', owner, ['component-c']),
        this.getComponent('component-b', owner, []),
        this.getComponent('component-c', owner, []),
      ].map(e => ({
        entity: e,
        location: 'http://fake.com',
      }));

      await this.connection?.applyMutation({
        type: 'delta',
        added: [...entities],
        removed: [],
      });
      return resp.status(200).send({ message: 'OK' });
    });

    return router;
  }

  getOwner(): Entity {
    return {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Group',
      metadata: {
        name: 'group-1',
        title: 'Group 1',
        annotations: {
          'backstage.io/managed-by-location': 'url:http://fake.com',
          'backstage.io/managed-by-origin-location': 'url:http://fake.com',
        },
      },
      spec: {
        type: 'team',
        children: [],
      },
    };
  }

  getComponent(name: string, owner: Entity, dependsOn: string[]): Entity {
    return {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'rawComponent',
      metadata: {
        name,
        annotations: {
          'backstage.io/managed-by-location': 'url:http://fake.com',
          'backstage.io/managed-by-origin-location': 'url:http://fake.com',
        },
      },
      spec: {
        type: 'service',
        lifecycle: 'production',
        owner: stringifyEntityRef(owner),
        dependsOn,
      },
    };
  }
}
