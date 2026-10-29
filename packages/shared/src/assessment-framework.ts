export interface FrameworkTopicGroup {
  id: string;
  category: 'compute' | 'storage' | 'security' | 'monitor' | 'integration';
  title: string;
  description: string;
}

export interface FrameworkCategoryRule {
  category: 'compute' | 'storage' | 'security' | 'monitor' | 'integration';
  label: string;
  minPercent: number;
  maxPercent: number;
}

export const AZ_204_CATEGORY_RULES: FrameworkCategoryRule[] = [
  { category: 'compute', label: 'Develop Azure compute solutions', minPercent: 25, maxPercent: 30 },
  { category: 'storage', label: 'Develop for Azure storage', minPercent: 15, maxPercent: 20 },
  { category: 'security', label: 'Implement Azure security', minPercent: 15, maxPercent: 20 },
  { category: 'monitor', label: 'Monitor, troubleshoot, and optimize Azure solutions', minPercent: 5, maxPercent: 10 },
  { category: 'integration', label: 'Connect to and consume Azure services and third-party services', minPercent: 20, maxPercent: 25 },
];

export const AZ_204_TOPICS: FrameworkTopicGroup[] = [
  { id: 'compute-containers', category: 'compute', title: 'Containerized Solutions', description: 'Create and manage container images and Azure Container Apps/Instances' },
  { id: 'compute-app-service', category: 'compute', title: 'Azure App Service Web Apps', description: 'Implement web apps, configuration, scaling, and deployment slots' },
  { id: 'compute-functions', category: 'compute', title: 'Azure Functions', description: 'Implement triggers, bindings, and stateful functions' },
  { id: 'storage-cosmos', category: 'storage', title: 'Azure Cosmos DB Storage', description: 'Perform operations on containers, items, consistency levels, and change feeds' },
  { id: 'storage-blob', category: 'storage', title: 'Azure Blob Storage', description: 'Manage blob lifecycle, metadata, properties, and client libraries' },
  { id: 'security-auth', category: 'security', title: 'User Authentication & Authorization', description: 'Microsoft Identity platform, MSAL, OAuth2, and shared access signatures' },
  { id: 'security-config', category: 'security', title: 'Secure Cloud Solutions', description: 'Azure Key Vault, Managed Identities, and App Configuration' },
  { id: 'monitor-caching', category: 'monitor', title: 'Caching & Content Delivery', description: 'Azure Cache for Redis and Azure CDN / Front Door caching patterns' },
  { id: 'monitor-insights', category: 'monitor', title: 'Application Insights & Monitoring', description: 'Metrics, logs, distributed tracing, and availability tests' },
  { id: 'integration-apim', category: 'integration', title: 'API Management', description: 'APIM policies, authentication, caching, and gateway management' },
  { id: 'integration-events', category: 'integration', title: 'Event & Message-Based Solutions', description: 'Azure Event Grid, Event Hubs, Service Bus, and Queue Storage' },
];

export const AZ_204_FRAMEWORK = {
  code: 'AZ-204',
  name: 'Microsoft Azure Developer Associate Reference Blueprint',
  provider: 'MICROSOFT',
  version: '2026-01-14',
  retiredOn: '2026-07-31',
  disclaimer: 'Internal platform reference blueprint only. Not an official Microsoft certification.',
  categories: AZ_204_CATEGORY_RULES,
  topics: AZ_204_TOPICS,
};

export interface FrameworkQuestionInput {
  points?: number;
  frameworkTopicId?: string | null;
  frameworkMappingNote?: string | null;
}

export interface FrameworkCoverageResult {
  isValid: boolean;
  errors: string[];
  frameworkCode: string | null;
  frameworkVersion: string | null;
  frameworkScope: string | null;
  retiredOn: string | null;
  totalPoints: number;
  coveredTopicIds: string[];
  categoryBreakdown: Record<
    string,
    {
      points: number;
      percentage: number;
      minPercent: number;
      maxPercent: number;
      inRange: boolean;
    }
  >;
}

export function evaluateFrameworkCoverage(input: {
  frameworkCode?: string | null;
  frameworkVersion?: string | null;
  frameworkScope?: string | null;
  questions?: FrameworkQuestionInput[];
}): FrameworkCoverageResult {
  const code = input.frameworkCode?.trim() || null;
  const version = input.frameworkVersion?.trim() || null;
  const scope = input.frameworkScope?.trim() || null;
  const questions = Array.isArray(input.questions) ? input.questions : [];
  const errors: string[] = [];

  if (!code) {
    if (version || scope) {
      errors.push('Cannot specify frameworkVersion or frameworkScope when frameworkCode is not set.');
    }
    const hasQuestionMapping = questions.some(
      (q) => Boolean(q.frameworkTopicId?.trim()) || Boolean(q.frameworkMappingNote?.trim()),
    );
    if (hasQuestionMapping) {
      errors.push('Questions cannot contain frameworkTopicId or frameworkMappingNote when frameworkCode is not set.');
    }
    return {
      isValid: errors.length === 0,
      errors,
      frameworkCode: null,
      frameworkVersion: null,
      frameworkScope: null,
      retiredOn: null,
      totalPoints: 0,
      coveredTopicIds: [],
      categoryBreakdown: {},
    };
  }

  if (code !== AZ_204_FRAMEWORK.code) {
    errors.push(`Unsupported frameworkCode: ${code}`);
  }
  if (version !== AZ_204_FRAMEWORK.version) {
    errors.push(`frameworkVersion must be ${AZ_204_FRAMEWORK.version} for ${AZ_204_FRAMEWORK.code}`);
  }
  if (scope !== 'TOPIC_PRACTICE' && scope !== 'FULL_BLUEPRINT') {
    errors.push('frameworkScope must be TOPIC_PRACTICE or FULL_BLUEPRINT');
  }

  const topicMap = new Map(AZ_204_TOPICS.map((t) => [t.id, t]));
  const categoryPoints: Record<string, number> = {
    compute: 0,
    storage: 0,
    security: 0,
    monitor: 0,
    integration: 0,
  };
  const coveredTopics = new Set<string>();
  let totalPoints = 0;

  questions.forEach((q, idx) => {
    const pts = typeof q.points === 'number' && q.points > 0 ? q.points : 0;
    totalPoints += pts;
    const topicId = q.frameworkTopicId?.trim() || '';
    const note = q.frameworkMappingNote?.trim() || '';

    if (!topicId || !topicMap.has(topicId)) {
      errors.push(`Question ${idx + 1} must map to a valid ${AZ_204_FRAMEWORK.code} topicId.`);
    } else {
      const topic = topicMap.get(topicId)!;
      coveredTopics.add(topicId);
      categoryPoints[topic.category] = (categoryPoints[topic.category] || 0) + pts;
    }

    if (note.length < 20 || note.length > 2000) {
      errors.push(`Question ${idx + 1} frameworkMappingNote must be between 20 and 2000 characters.`);
    }
  });

  const categoryBreakdown: FrameworkCoverageResult['categoryBreakdown'] = {};
  for (const rule of AZ_204_CATEGORY_RULES) {
    const pts = categoryPoints[rule.category] || 0;
    const pct = totalPoints > 0 ? Math.round((pts / totalPoints) * 1000) / 10 : 0;
    const inRange = pct >= rule.minPercent && pct <= rule.maxPercent;
    categoryBreakdown[rule.category] = {
      points: pts,
      percentage: pct,
      minPercent: rule.minPercent,
      maxPercent: rule.maxPercent,
      inRange,
    };
  }

  if (scope === 'FULL_BLUEPRINT') {
    if (coveredTopics.size < AZ_204_TOPICS.length) {
      errors.push(
        `FULL_BLUEPRINT requires covering all ${AZ_204_TOPICS.length} topic groups (covered ${coveredTopics.size}).`,
      );
    }
    for (const rule of AZ_204_CATEGORY_RULES) {
      const b = categoryBreakdown[rule.category];
      if (!b.inRange) {
        errors.push(
          `Category "${rule.category}" weight is ${b.percentage}% (must be ${rule.minPercent}%-${rule.maxPercent}%).`,
        );
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    frameworkCode: code,
    frameworkVersion: version,
    frameworkScope: scope,
    retiredOn: AZ_204_FRAMEWORK.retiredOn,
    totalPoints,
    coveredTopicIds: Array.from(coveredTopics),
    categoryBreakdown,
  };
}
