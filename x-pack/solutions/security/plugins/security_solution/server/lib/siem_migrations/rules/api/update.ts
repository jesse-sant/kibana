/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IKibanaResponse, Logger } from '@kbn/core/server';
import { buildRouteValidationWithZod } from '@kbn/zod-helpers';
import { SIEM_RULE_MIGRATIONS_PATH } from '../../../../../common/siem_migrations/constants';
import {
  UpdateRuleMigrationRequestBody,
  type UpdateRuleMigrationResponse,
} from '../../../../../common/siem_migrations/model/api/rules/rule_migration.gen';
import type { SecuritySolutionPluginRouter } from '../../../../types';
import { SiemMigrationAuditLogger, SiemMigrationsAuditActions } from './util/audit';
import { transformToInternalUpdateRuleMigrationData } from './util/update_rules';
import { withLicense } from './util/with_license';

export const registerSiemRuleMigrationsUpdateRoute = (
  router: SecuritySolutionPluginRouter,
  logger: Logger
) => {
  router.versioned
    .put({
      path: SIEM_RULE_MIGRATIONS_PATH,
      access: 'internal',
      security: { authz: { requiredPrivileges: ['securitySolution'] } },
    })
    .addVersion(
      {
        version: '1',
        validate: {
          request: { body: buildRouteValidationWithZod(UpdateRuleMigrationRequestBody) },
        },
      },
      withLicense(
        async (context, req, res): Promise<IKibanaResponse<UpdateRuleMigrationResponse>> => {
          const rulesToUpdate = req.body;
          let siemMigrationAuditLogger: SiemMigrationAuditLogger | undefined;
          try {
            const ctx = await context.resolve(['securitySolution']);
            const ruleMigrationsClient = ctx.securitySolution.getSiemRuleMigrationsClient();
            const auditLogger = ctx.securitySolution.getAuditLogger();
            if (auditLogger) {
              siemMigrationAuditLogger = new SiemMigrationAuditLogger(auditLogger);
            }
            for (const rule of rulesToUpdate) {
              siemMigrationAuditLogger?.log({
                action: SiemMigrationsAuditActions.SIEM_MIGRATION_UPDATED_RULE,
                id: rule.id,
              });
            }
            const transformedRuleToUpdate = rulesToUpdate.map(
              transformToInternalUpdateRuleMigrationData
            );
            await ruleMigrationsClient.data.rules.update(transformedRuleToUpdate);

            return res.ok({ body: { updated: true } });
          } catch (err) {
            logger.error(err);
            for (const rule of rulesToUpdate) {
              siemMigrationAuditLogger?.log({
                action: SiemMigrationsAuditActions.SIEM_MIGRATION_UPDATED_RULE,
                error: err,
                id: rule.id,
              });
            }
            return res.badRequest({ body: err.message });
          }
        }
      )
    );
};
