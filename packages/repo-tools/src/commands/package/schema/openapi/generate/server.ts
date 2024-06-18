/*
 * Copyright 2023 The Backstage Authors
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

import chalk from 'chalk';
import { resolve, dirname, join } from 'path';
import YAML from 'js-yaml';
import {
  OLD_SCHEMA_PATH,
  OPENAPI_IGNORE_FILES,
  OUTPUT_PATH,
  TS_SCHEMA_PATH,
} from '../../../../../lib/openapi/constants';
import { paths as cliPaths } from '../../../../../lib/paths';
import fs from 'fs-extra';
import { exec } from '../../../../../lib/exec';
import { resolvePackagePath } from '@backstage/backend-plugin-api';
import {
  getPathToCurrentOpenApiSpec,
  getRelativePathToFile,
} from '../../../../../lib/openapi/helpers';

async function generateSpecFile() {
  const openapiPath = await getPathToCurrentOpenApiSpec();
  const yaml = YAML.load(await fs.readFile(openapiPath, 'utf8'));

  const tsPath = cliPaths.resolveTarget(TS_SCHEMA_PATH);

  const schemaDir = dirname(tsPath);
  await fs.mkdirp(schemaDir);

  const oldTsPath = cliPaths.resolveTarget(OLD_SCHEMA_PATH);
  if (fs.existsSync(oldTsPath)) {
    console.warn(`Removing old schema file at ${oldTsPath}`);
    fs.removeSync(oldTsPath);
  }

  // The first set of comment slashes allow for the eslint notice plugin to run
  // with onNonMatchingHeader: 'replace', as is the case in the open source
  // Backstage repo. Otherwise the auto-generated comment will be removed by the
  // lint call below.
  await fs.writeFile(
    tsPath,
    `//

// ******************************************************************
// * THIS IS AN AUTOGENERATED FILE. DO NOT EDIT THIS FILE DIRECTLY. *
// ******************************************************************
import {createValidatedOpenApiRouterFromGeneratedEndpointMap} from '@backstage/backend-openapi-utils';
import {EndpointMap} from './';
export const spec = ${JSON.stringify(yaml, null, 2)} as const;
export const createOpenApiRouter = async (
  options?: Parameters<typeof createValidatedOpenApiRouterFromGeneratedEndpointMap>['1'],
) => createValidatedOpenApiRouterFromGeneratedEndpointMap<EndpointMap>(spec, options);
`,
  );

  const indexFile = join(schemaDir, '..', 'index.ts');
  await fs.writeFile(
    indexFile,
    `// 
    export * from './generated';`,
  );

  await exec(`yarn backstage-cli package lint`, ['--fix', tsPath, indexFile]);
  if (await cliPaths.resolveTargetRoot('node_modules/.bin/prettier')) {
    await exec(`yarn prettier`, ['--write', tsPath, indexFile], {
      cwd: cliPaths.targetRoot,
    });
  }
}

async function generate(abortSignal?: AbortController) {
  const resolvedOpenapiPath = await getPathToCurrentOpenApiSpec();
  const resolvedOutputDirectory = await getRelativePathToFile(OUTPUT_PATH);

  await fs.mkdirp(resolvedOutputDirectory);

  await fs.writeFile(
    resolve(resolvedOutputDirectory, '.openapi-generator-ignore'),
    OPENAPI_IGNORE_FILES.join('\n'),
  );

  const additionalProperties = [];
  if (clientImport) {
    additionalProperties.push(`clientImport=${clientImport}`);
  }

  await exec(
    'node',
    [
      resolvePackagePath('@openapitools/openapi-generator-cli', 'main.js'),
      'generate',
      '-i',
      resolvedOpenapiPath,
      '-o',
      resolvedOutputDirectory,
      '-g',
      'typescript',
      '-c',
      resolvePackagePath(
        '@backstage/repo-tools',
        'templates/typescript-backstage-server.yaml',
      ),
      `--additional-properties=${additionalProperties.join(',')}`,
      '--generator-key',
      'v3.0',
    ],
    {
      maxBuffer: Number.MAX_VALUE,
      cwd: resolvePackagePath('@backstage/repo-tools'),
      env: {
        ...process.env,
      },
      signal: abortSignal?.signal,
    },
  );

  await exec(
    `yarn backstage-cli package lint --fix ${resolvedOutputDirectory}`,
    [],
    {
      signal: abortSignal?.signal,
    },
  );

  const prettier = cliPaths.resolveTargetRoot('node_modules/.bin/prettier');
  if (prettier) {
    await exec(`${prettier} --write ${resolvedOutputDirectory}`, [], {
      signal: abortSignal?.signal,
    });
  }

  fs.removeSync(resolve(resolvedOutputDirectory, '.openapi-generator-ignore'));

  fs.rmSync(resolve(resolvedOutputDirectory, '.openapi-generator'), {
    recursive: true,
    force: true,
  });

  await generateSpecFile();
}

export async function command({
  abortSignal,
  isWatch = false,
}: {
  abortSignal?: AbortController;
  isWatch?: boolean;
}): Promise<void> {
  try {
    await generate(abortSignal);
    console.log(chalk.green('Generated server files.'));
  } catch (err) {
    if (err.name === 'AbortError') {
      console.debug('Server generation aborted.');
      return;
    }
    if (isWatch) {
      console.log(chalk.red(`Server generation failed:`));
      console.group();
      console.log(chalk.red(err.message));
      console.groupEnd();
    } else {
      console.log(chalk.red(err.message));
      console.log(chalk.red(`OpenAPI server stub generation failed.`));
    }
  }
}
