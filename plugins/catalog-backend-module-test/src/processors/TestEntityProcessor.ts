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
  CatalogProcessor,
  CatalogProcessorCache,
  CatalogProcessorEmit,
} from '@backstage/plugin-catalog-node';
import { Entity } from '@backstage/catalog-model';
import { LocationSpec } from '@backstage/plugin-catalog-common';

export class TestEntityProcessor implements CatalogProcessor {
  getProcessorName(): string {
    return 'test-processor';
  }

  async validateEntityKind?(entity: Entity): Promise<boolean> {
    return entity.kind === 'rawComponent';
  }

  async postProcessEntity?(
    entity: Entity,
    location: LocationSpec,
    emit: CatalogProcessorEmit,
    _cache: CatalogProcessorCache,
  ): Promise<Entity> {
    if (entity.kind === 'rawComponent') {
      const dependsOn = (entity.spec?.dependsOn as string[]) ?? [];
      emit({
        type: 'entity',
        entity: {
          apiVersion: 'backstage.io/v1alpha1',
          kind: 'Component',
          metadata: {
            name: entity.metadata.name,
            annotations: {
              'backstage.io/managed-by-location': 'url:http://fake.com',
              'backstage.io/managed-by-origin-location': 'url:http://fake.com',
            },
          },
          spec: {
            type: 'service',
            lifecycle: 'production',
            owner: entity.spec?.owner,
            // Uncommenting this out will create the standard dependsOn/dependencyOf
            // relationships and will cause result in the testDependsOn/testDependencOf
            // to be updated properly too!
            // dependsOn: dependsOn.map(d => `component:default/${d}`),
          },
        },
        location,
      });
      dependsOn.forEach(d => {
        emit({
          type: 'relation',
          relation: {
            type: 'testDependsOn',
            source: {
              kind: 'Component',
              namespace: 'default',
              name: entity.metadata.name,
            },
            target: { kind: 'Component', namespace: 'default', name: d },
          },
        });
        emit({
          type: 'relation',
          relation: {
            type: 'testDependencyOf',
            target: {
              kind: 'Component',
              namespace: 'default',
              name: entity.metadata.name,
            },
            source: { kind: 'Component', namespace: 'default', name: d },
          },
        });
      });
    }
    return entity;
  }
}
