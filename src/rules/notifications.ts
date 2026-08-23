import type { DiagnosticFinding, DiagnosticResult, DiagnosticSeverity } from '../diagnostics.js';
import { cancellationCheckpoint } from '../deadline.js';
import {
  PREDEFINED_NOTIFICATIONS,
  parseNotificationHandlers,
  parsePromiseRegistration,
  parseSentNotifications,
  type NotificationHandler,
  type SentNotification,
} from '../project/notifications.js';
import {
  certainFinding,
  heuristicFinding,
  summarizeFindings,
  unsupportedSyntaxFinding,
} from './uncertainty.js';

export interface NotificationRule {
  readonly code: string;
  readonly severity: DiagnosticSeverity;
  readonly certainty: 'certain' | 'likely' | 'possible';
  readonly summary: string;
  readonly falsePositives: readonly string[];
}

export const NOTIFICATION_RULES: readonly NotificationRule[] = [
  {
    code: 'notification.trace.unavailable',
    severity: 'information',
    certainty: 'certain',
    summary: 'The contract could not be traced because one side of it could not be read.',
    falsePositives: [],
  },
  {
    code: 'notification.subscription.duplicate',
    severity: 'warning',
    certainty: 'certain',
    summary: 'The client subscribes to one notification name more than once.',
    falsePositives: [],
  },
  {
    code: 'notification.sent.not-handled',
    severity: 'warning',
    certainty: 'likely',
    summary: 'The server sends a notification no readable client handler receives.',
    falsePositives: [
      'A handler may be bound dynamically, inherited from a shared client module, or declared in a file outside the read budget.',
      'A notification consumed only by the framework replay or spectator view has no project handler by design.',
    ],
  },
  {
    code: 'notification.handled.not-sent',
    severity: 'information',
    certainty: 'possible',
    summary: 'The client handles a notification no readable server source sends.',
    falsePositives: [
      'The send may be built at runtime, live in a file outside the read budget, or come from a framework module rather than project code.',
      'A handler kept for an upcoming feature is intentional and harmless.',
    ],
  },
  {
    code: 'notification.payload.mismatch',
    severity: 'warning',
    certainty: 'likely',
    summary: 'The server payload and the client handler disagree about a key.',
    falsePositives: [
      'A payload assembled at runtime cannot be compared; such a send is reported as unsupported syntax instead.',
      'A handler may read the payload through a helper or destructuring form this reader does not recognize.',
    ],
  },
];

const RULES_BY_CODE = new Map(NOTIFICATION_RULES.map((rule) => [rule.code, rule]));

function definition(code: string): NotificationRule {
  const rule = RULES_BY_CODE.get(code);
  if (rule === undefined) {
    throw new Error(`Unknown notification rule: ${code}`);
  }
  return rule;
}

/** Positional wrappers over the shared finding builders. */
function certain(
  code: string,
  message: string,
  evidence: string,
  uri: string | null,
  suggestion: string,
): DiagnosticFinding {
  return certainFinding(definition(code), { code, message, evidence, uri, suggestion });
}

function heuristic(
  code: string,
  message: string,
  evidence: string,
  uri: string | null,
  suggestion: string,
): DiagnosticFinding {
  return heuristicFinding(definition(code), { code, message, evidence, uri, suggestion });
}

function unsupported(construct: string, uri: string, language: string): DiagnosticFinding {
  return unsupportedSyntaxFinding({
    code: 'notification.unsupported-syntax',
    construct,
    language,
    uri,
    message: `Part of the notification contract could not be read: ${construct}.`,
    suggestion:
      'Use a literal notification name and payload, or confirm the dynamic form is intended.',
  });
}

export interface NotificationSource {
  readonly path: string;
  readonly text: string;
}

export interface NotificationTrace {
  readonly sent: readonly (SentNotification & { readonly source: string })[];
  readonly handlers: readonly (NotificationHandler & { readonly source: string })[];
  readonly diagnostics: DiagnosticResult;
}

/**
 * Compares the notifications a server sends with the handlers a client
 * declares, including their payload keys.
 *
 * A duplicate subscription is provable from the client source and reported as
 * a fact. Every claim that spans the two sides is a heuristic, because either
 * side may bind or build a notification in a way a textual reader cannot see.
 */
export function validateNotifications(
  serverSources: readonly NotificationSource[],
  clientSources: readonly NotificationSource[],
  signal?: AbortSignal,
): NotificationTrace {
  const findings: DiagnosticFinding[] = [];

  const sent: (SentNotification & { source: string })[] = [];
  for (const source of serverSources) {
    cancellationCheckpoint(signal);
    const outcome = parseSentNotifications(source.text, signal);
    for (const notification of outcome.value) {
      cancellationCheckpoint(signal);
      sent.push({ ...notification, source: source.path });
    }
    for (const construct of outcome.unsupported) {
      cancellationCheckpoint(signal);
      findings.push(unsupported(construct, source.path, 'php'));
    }
  }

  // The registration may live in one file while the handlers live in others:
  // "handlers: [this, ...this.bga.states.getStateClasses()]". So it is looked
  // for across the whole client before any file is read for handlers.
  const registration =
    clientSources
      .map((source) => {
        cancellationCheckpoint(signal);
        return parsePromiseRegistration(source.text, signal);
      })
      .find((entry) => entry !== null) ?? null;

  const handlers: (NotificationHandler & { source: string })[] = [];
  for (const source of clientSources) {
    cancellationCheckpoint(signal);
    const outcome = parseNotificationHandlers(source.text, registration, signal);
    for (const handler of outcome.value) {
      cancellationCheckpoint(signal);
      handlers.push({ ...handler, source: source.path });
    }
    for (const construct of outcome.unsupported) {
      cancellationCheckpoint(signal);
      findings.push(unsupported(construct, source.path, 'javascript'));
    }
    for (const name of outcome.duplicates) {
      cancellationCheckpoint(signal);
      findings.push(
        certain(
          'notification.subscription.duplicate',
          `The client subscribes to '${name}' more than once.`,
          'Two subscriptions in the same client source use the same notification name.',
          source.path,
          'Remove the duplicate subscription so the handler runs once per notification.',
        ),
      );
    }
  }

  const missingSides = [
    serverSources.length > 0 ? null : 'no readable server source',
    clientSources.length > 0 ? null : 'no readable client source',
  ].filter((side): side is string => side !== null);
  if (missingSides.length > 0) {
    findings.push(
      certain(
        'notification.trace.unavailable',
        `The notification contract could not be traced: ${missingSides.join(', ')}.`,
        'One or both sides of the server-to-client contract could not be read.',
        null,
        'Confirm the project layout is supported, or report the sources that could not be read.',
      ),
    );
  } else if (sent.length === 0 && handlers.length === 0) {
    // Both sides were readable and neither mentioned a notification. That is
    // either a project that sends none, or a form this reader cannot see. It
    // is not evidence that the contract is sound.
    findings.push(
      certain(
        'notification.trace.unavailable',
        'No notification send or handler was found, so nothing could be compared.',
        `Neither ${String(serverSources.length)} server source file(s) nor ${String(clientSources.length)} client source file(s) contained a recognized notification.`,
        null,
        'Confirm the project sends no notifications, or report the form it uses so this reader can support it.',
      ),
    );
  }

  // A method nothing registers is not a handler, so it neither receives a
  // notification nor counts as one the server forgot to send.
  const boundHandlers = handlers.filter((handler) => handler.bound);
  const handlerByName = new Map(boundHandlers.map((handler) => [handler.name, handler]));
  const sentByName = new Map(sent.map((notification) => [notification.name, notification]));
  const bothSidesReadable = serverSources.length > 0 && clientSources.length > 0;
  const predefined = new Set<string>(PREDEFINED_NOTIFICATIONS);

  if (bothSidesReadable) {
    for (const notification of sent) {
      cancellationCheckpoint(signal);
      // A predefined type is handled by the framework itself: `message` "shows
      // on players log and have no other effect", and the documentation shows
      // it sent with nothing on the client side.
      if (!handlerByName.has(notification.name) && !predefined.has(notification.name)) {
        const declared = handlers.find(
          (handler) => handler.name === notification.name && !handler.bound,
        );
        findings.push(
          heuristic(
            'notification.sent.not-handled',
            `The server sends '${notification.name}', which no readable client handler receives.`,
            declared === undefined
              ? `No subscription or notif_${notification.name} method was found in ${String(clientSources.length)} readable client source file(s).`
              : `${declared.source} declares a notif_${notification.name} method, but nothing registers it: setupPromiseNotifications is ${registration === null ? 'never called' : 'told to ignore it'}.`,
            notification.source,
            `Add a handler for '${notification.name}' in the client, or stop sending it.`,
          ),
        );
      }
    }

    for (const handler of boundHandlers) {
      cancellationCheckpoint(signal);
      if (!sentByName.has(handler.name)) {
        findings.push(
          heuristic(
            'notification.handled.not-sent',
            `The client handles '${handler.name}', which no readable server source sends.`,
            `No notifyAllPlayers or notifyPlayer call with the name '${handler.name}' was found.`,
            handler.source,
            `Send '${handler.name}' from the server, or remove the handler.`,
          ),
        );
      }
    }
  }

  for (const notification of sent) {
    cancellationCheckpoint(signal);
    const handler = handlerByName.get(notification.name);
    if (
      handler === undefined ||
      handler.payloadKeys.length === 0 ||
      notification.payloadShape === 'unknown'
    ) {
      continue;
    }
    const sentKeys = new Set(notification.payloadKeys);
    const readKeys = new Set(handler.payloadKeys);
    for (const key of [...readKeys].filter((name) => !sentKeys.has(name)).sort()) {
      cancellationCheckpoint(signal);
      findings.push(
        heuristic(
          'notification.payload.mismatch',
          `The handler for '${notification.name}' reads '${key}', which the server payload does not contain.`,
          `'${key}' is read in the handler but absent from the sent payload.`,
          handler.source,
          `Send '${key}' in the '${notification.name}' payload, or stop reading it.`,
        ),
      );
    }
    for (const key of [...sentKeys].filter((name) => !readKeys.has(name)).sort()) {
      cancellationCheckpoint(signal);
      findings.push(
        heuristic(
          'notification.payload.mismatch',
          `The server sends '${key}' in '${notification.name}', which its handler never reads.`,
          `'${key}' is in the sent payload but absent from the handler.`,
          notification.source,
          `Read '${key}' in the handler, or stop sending it.`,
        ),
      );
    }
  }

  cancellationCheckpoint(signal);
  return { sent, handlers, diagnostics: summarizeFindings(findings, signal) };
}
