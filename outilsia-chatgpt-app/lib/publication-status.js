const STATES = new Set([
  "review",
  "approved_unpublished",
  "published",
  "changes_requested",
]);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TRANSITIONS = Object.freeze({
  review: new Set(["review", "approved_unpublished", "changes_requested"]),
  approved_unpublished: new Set(["approved_unpublished", "published", "changes_requested"]),
  published: new Set(["published"]),
  changes_requested: new Set(["changes_requested", "review"]),
});

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function requireDate(value, label, { nullable = false } = {}) {
  if (nullable && value === null) return;
  requireCondition(typeof value === "string" && DATE_RE.test(value), `${label} must use YYYY-MM-DD.`);
  requireCondition(!Number.isNaN(Date.parse(`${value}T00:00:00Z`)), `${label} is not a valid date.`);
}

function requireNullableString(value, label) {
  requireCondition(value === null || (typeof value === "string" && value.trim()), `${label} must be null or a non-empty string.`);
}

function compareDates(left, right, message) {
  if (left && right) requireCondition(left <= right, message);
}

function validateDirectoryUrl(value) {
  requireCondition(typeof value === "string" && value.trim(), "directory_url is required when published.");
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("directory_url must be an absolute URL.");
  }
  requireCondition(parsed.protocol === "https:", "directory_url must use HTTPS.");
  requireCondition(
    parsed.hostname === "chatgpt.com" || parsed.hostname.endsWith(".chatgpt.com"),
    "directory_url must point to the official chatgpt.com directory.",
  );
}

export function validatePublicationStatus(status) {
  requireCondition(status && typeof status === "object" && !Array.isArray(status), "Publication status must be an object.");
  requireCondition(
    status.schema_version === "outilsia.chatgpt.publication-status.v1",
    "Unsupported publication status schema.",
  );
  requireCondition(status.app_name === "OutilsIA Local Cockpit", "Unexpected app_name.");
  requireCondition(/^\d+\.\d+\.\d+$/.test(status.submission_version), "submission_version must be semantic.");
  requireCondition(/^\d+\.\d+\.\d+$/.test(status.mcp_version), "mcp_version must be semantic.");
  requireCondition(STATES.has(status.state), `Unknown publication state: ${status.state}`);
  requireDate(status.submitted_on, "submitted_on");
  requireDate(status.last_checked_on, "last_checked_on");
  requireDate(status.approved_on, "approved_on", { nullable: true });
  requireDate(status.published_on, "published_on", { nullable: true });
  requireNullableString(status.directory_url, "directory_url");
  requireCondition(status.evidence?.kind === "openai_platform_dashboard", "Evidence must come from the OpenAI Platform dashboard.");
  requireCondition(typeof status.evidence?.label === "string" && status.evidence.label.trim(), "Evidence label is required.");
  requireCondition(
    typeof status.evidence?.status_label === "string" && status.evidence.status_label.trim(),
    "Evidence status label is required.",
  );

  compareDates(status.submitted_on, status.last_checked_on, "last_checked_on cannot predate submitted_on.");

  if (status.state === "review" || status.state === "changes_requested") {
    requireCondition(status.approved_on === null, `${status.state} cannot have approved_on.`);
    requireCondition(status.published_on === null, `${status.state} cannot have published_on.`);
    requireCondition(status.directory_url === null, `${status.state} cannot have directory_url.`);
  }
  if (status.state === "approved_unpublished") {
    requireCondition(status.approved_on !== null, "approved_unpublished requires approved_on.");
    requireCondition(status.published_on === null, "approved_unpublished cannot have published_on.");
    requireCondition(status.directory_url === null, "approved_unpublished cannot have directory_url.");
  }
  if (status.state === "published") {
    requireCondition(status.approved_on !== null, "published requires approved_on.");
    requireCondition(status.published_on !== null, "published requires published_on.");
    validateDirectoryUrl(status.directory_url);
  }

  compareDates(status.submitted_on, status.approved_on, "approved_on cannot predate submitted_on.");
  compareDates(status.approved_on, status.last_checked_on, "last_checked_on cannot predate approved_on.");
  compareDates(status.approved_on, status.published_on, "published_on cannot predate approved_on.");
  compareDates(status.published_on, status.last_checked_on, "last_checked_on cannot predate published_on.");

  return status;
}

export function validatePublicationTransition(currentState, nextState) {
  requireCondition(STATES.has(currentState), `Unknown current publication state: ${currentState}`);
  requireCondition(STATES.has(nextState), `Unknown next publication state: ${nextState}`);
  requireCondition(
    TRANSITIONS[currentState].has(nextState),
    `Refusing publication state regression ${currentState}->${nextState}.`,
  );
  return nextState;
}

function formatFrenchDate(value) {
  const months = [
    "janvier",
    "février",
    "mars",
    "avril",
    "mai",
    "juin",
    "juillet",
    "août",
    "septembre",
    "octobre",
    "novembre",
    "décembre",
  ];
  const [year, month, day] = value.split("-").map(Number);
  return `${day} ${months[month - 1]} ${year}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function commonCopy(status) {
  const submitted = formatFrenchDate(status.submitted_on);
  const approved = status.approved_on ? formatFrenchDate(status.approved_on) : "";
  const published = status.published_on ? formatFrenchDate(status.published_on) : "";
  const directoryUrl = status.directory_url ? escapeHtml(status.directory_url) : "";

  return { submitted, approved, published, directoryUrl };
}

export function publicationStatusCopy(input) {
  const status = validatePublicationStatus(input);
  const { submitted, approved, published, directoryUrl } = commonCopy(status);

  if (status.state === "review") {
    return {
      state: status.state,
      heroEyebrow: "App ChatGPT · soumise, examen en cours",
      heroActions: [
        '<a class="btn primary" href="#tester">Tester en mode développeur</a>',
        '<a class="btn secondary" href="/telecharger-scanner-ia-local">Télécharger Local Cockpit</a>',
      ],
      honest: `<strong>Statut honnête :</strong> l'app v0.3 fonctionne en mode développeur avec son serveur MCP et sa fiche visuelle. Sa soumission initiale a été envoyée le ${submitted} ; elle reste en cours d'examen et n'est pas présentée comme approuvée ou publiée par OpenAI.`,
      directoryQuestion: "L'app OutilsIA est-elle déjà publiée dans l'annuaire ChatGPT ?",
      directoryAnswer: `Non. La soumission initiale a été envoyée à OpenAI le ${submitted} et reste en cours d'examen. L'app demeure accessible en mode développeur sans être présentée comme approuvée ou publiée dans l'annuaire.`,
      tester: {
        badge: "Soumission en cours d'examen",
        title: "Connecter le serveur MCP public",
        lead: "Dans ChatGPT Pro, ouvrez le menu <strong>Plugins</strong> en haut de la conversation, activez le mode développeur, puis ajoutez l'app avec l'URL de production ci-dessous.",
        action: '<div class="code-block">https://outilsia.fr/mcp</div>',
        steps: [
          ["Ouvrir Plugins", "Utilisez le menu Plugins en haut de ChatGPT Pro, puis choisissez le mode développeur."],
          ["Ajouter l'app OutilsIA", "Sélectionnez + et utilisez exactement l'URL HTTPS affichée."],
          ["Ouvrir une nouvelle conversation", "Ajoutez OutilsIA depuis le menu Plus, puis testez un profil complet."],
        ],
      },
      independent: "OutilsIA.fr est un service indépendant. ChatGPT et OpenAI sont des marques de leurs propriétaires respectifs. Cette page ne revendique ni partenariat ni validation de la soumission publique.",
      footer: "OutilsIA pour ChatGPT · soumission en cours d'examen",
      scannerPill: "App ChatGPT · soumise, examen en cours",
      scannerLead: "Le serveur MCP OutilsIA est disponible pour recette. Il estime la compatibilité depuis un profil déclaré, analyse un rapport partagé et simule RAM/VRAM, mais ne scanne, n'installe et ne benchmarke jamais la machine depuis ChatGPT.",
      scannerStatus: `Statut public exact : endpoint développeur actif, soumission initiale envoyée à OpenAI le ${submitted} et examen en cours. L'app n'est pas encore publiée dans l'annuaire ; aucun partenariat ou agrément OpenAI n'est revendiqué.`,
      termsStatus: `La soumission initiale du service a été envoyée à OpenAI le ${submitted} et reste en cours d'examen. Le service demeure une bêta développeur et n'est pas présenté comme déjà approuvé ou publié dans l'annuaire ChatGPT.`,
      termsAccess: "L'utilisateur doit disposer d'un accès à ChatGPT autorisant les plugins ou serveurs MCP en mode développeur. Aucun compte OutilsIA n'est exigé pour une estimation déclarative. Un compte OutilsIA est nécessaire seulement pour créer et gérer un rapport partagé depuis Local Cockpit.",
      llmsStatus: `- Status checked on ${status.last_checked_on}: initial submission sent to OpenAI on ${status.submitted_on} and currently under review; the working developer beta, public MCP server and dedicated visual widget remain available, but the app is not yet published or approved in the public ChatGPT Plugins Directory.`,
    };
  }

  if (status.state === "approved_unpublished") {
    return {
      state: status.state,
      heroEyebrow: "App ChatGPT · approuvée, publication à venir",
      heroActions: [
        '<a class="btn primary" href="#tester">Tester en mode développeur</a>',
        '<a class="btn secondary" href="/telecharger-scanner-ia-local">Télécharger Local Cockpit</a>',
      ],
      honest: `<strong>Statut honnête :</strong> OpenAI a approuvé la fiche ${escapeHtml(status.submission_version)} le ${approved}. Elle n'est pas encore publiée dans le répertoire ; la bêta développeur et le serveur MCP restent disponibles pendant la préparation du lancement.`,
      directoryQuestion: "L'app OutilsIA est-elle déjà publiée dans l'annuaire ChatGPT ?",
      directoryAnswer: `Pas encore. OpenAI a approuvé la fiche ${escapeHtml(status.submission_version)} le ${approved}, mais OutilsIA n'a pas encore déclenché sa publication dans le répertoire.`,
      tester: {
        badge: "App approuvée · publication à venir",
        title: "Tester avant l'ouverture du répertoire",
        lead: "La fiche est approuvée, mais pas encore publiée. Le serveur MCP reste accessible en mode développeur pour la recette finale.",
        action: '<div class="code-block">https://outilsia.fr/mcp</div>',
        steps: [
          ["Relire la fiche approuvée", "Vérifiez le périmètre, les outils et les textes approuvés dans le portail OpenAI."],
          ["Tester le serveur MCP", "Utilisez le mode développeur avec l'URL HTTPS affichée, sans modifier le contrat approuvé."],
          ["Publier depuis le portail", "La présence dans le répertoire exige encore une action explicite du propriétaire."],
        ],
      },
      independent: "OutilsIA.fr est un service indépendant. L'approbation de la fiche par OpenAI ne constitue ni un partenariat, ni une certification des performances matérielles annoncées par les utilisateurs.",
      footer: "OutilsIA pour ChatGPT · approuvée, publication à venir",
      scannerPill: "App ChatGPT · approuvée, publication à venir",
      scannerLead: "La fiche OutilsIA a passé l'examen OpenAI. Le serveur MCP reste en lecture seule et la publication dans le répertoire nécessite encore une action explicite du propriétaire.",
      scannerStatus: `Statut public exact : fiche ${escapeHtml(status.submission_version)} approuvée le ${approved}, mais pas encore publiée dans le répertoire. Le mode développeur reste disponible pour la recette finale.`,
      termsStatus: `La fiche ${escapeHtml(status.submission_version)} a été approuvée par OpenAI le ${approved}, mais sa publication dans le répertoire n'a pas encore été déclenchée. Le service reste accessible en mode développeur pendant cette étape.`,
      termsAccess: "Avant la publication dans le répertoire, l'utilisateur doit disposer d'un accès à ChatGPT autorisant les plugins ou serveurs MCP en mode développeur. Aucun compte OutilsIA n'est exigé pour une estimation déclarative. Un compte OutilsIA est nécessaire seulement pour créer et gérer un rapport partagé depuis Local Cockpit.",
      llmsStatus: `- Status checked on ${status.last_checked_on}: submission version ${status.submission_version} was approved by OpenAI on ${status.approved_on}, but OutilsIA has not published it to the ChatGPT Plugins Directory yet; the developer beta remains available.`,
    };
  }

  if (status.state === "published") {
    return {
      state: status.state,
      heroEyebrow: "App ChatGPT · disponible dans le répertoire",
      heroActions: [
        `<a class="btn primary" href="${directoryUrl}">Ouvrir dans ChatGPT</a>`,
        '<a class="btn secondary" href="/telecharger-scanner-ia-local">Télécharger Local Cockpit</a>',
      ],
      honest: `<strong>Statut vérifié :</strong> la fiche ${escapeHtml(status.submission_version)} a été publiée dans le répertoire ChatGPT le ${published}. L'app reste en lecture seule ; le scan, l'installation et les benchmarks réels restent dans Local Cockpit.`,
      directoryQuestion: "L'app OutilsIA est-elle publiée dans l'annuaire ChatGPT ?",
      directoryAnswer: `Oui. La fiche ${escapeHtml(status.submission_version)} est publiée depuis le ${published}. Elle reste en lecture seule et ne remplace pas le scan réel du logiciel Local Cockpit.`,
      tester: {
        badge: "Disponible dans le répertoire ChatGPT",
        title: "Utiliser OutilsIA dans ChatGPT",
        lead: "Ouvrez la fiche officielle, ajoutez OutilsIA à votre conversation puis fournissez un profil matériel complet ou un rapport Local Cockpit partagé.",
        action: `<div class="actions"><a class="btn primary" href="${directoryUrl}">Ouvrir la fiche officielle</a></div>`,
        steps: [
          ["Ouvrir la fiche OutilsIA", "Utilisez le lien officiel du répertoire ChatGPT."],
          ["Ajouter OutilsIA à la conversation", "Sélectionnez l'app depuis le menu Plugins ou Plus de ChatGPT."],
          ["Donner des faits vérifiables", "Fournissez CPU, RAM, GPU et VRAM, ou une URL de rapport OutilsIA partagé."],
        ],
      },
      independent: "OutilsIA.fr est un service indépendant. Sa publication dans le répertoire ChatGPT ne constitue ni un partenariat avec OpenAI, ni une certification des performances matérielles annoncées par les utilisateurs.",
      footer: "OutilsIA pour ChatGPT · disponible dans le répertoire",
      scannerPill: "App ChatGPT · disponible",
      scannerLead: "OutilsIA peut relire un profil déclaré, analyser un rapport partagé et simuler RAM/VRAM directement dans ChatGPT. Le scan, l'installation et les benchmarks restent dans le logiciel desktop.",
      scannerStatus: `Statut public exact : fiche ${escapeHtml(status.submission_version)} publiée dans le répertoire ChatGPT le ${published}. L'app est en lecture seule et ne dispose d'aucun accès direct au PC.`,
      termsStatus: `La fiche ${escapeHtml(status.submission_version)} est publiée dans le répertoire ChatGPT depuis le ${published}. Le service reste en lecture seule et indépendant du logiciel desktop chargé des actions locales.`,
      termsAccess: "L'utilisateur peut ajouter OutilsIA depuis le répertoire ChatGPT dans les pays où l'app est disponible. Aucun compte OutilsIA n'est exigé pour une estimation déclarative. Un compte OutilsIA est nécessaire seulement pour créer et gérer un rapport partagé depuis Local Cockpit.",
      llmsStatus: `- Status checked on ${status.last_checked_on}: submission version ${status.submission_version} has been published in the ChatGPT Plugins Directory since ${status.published_on}. Official directory URL: ${status.directory_url}`,
    };
  }

  return {
    state: status.state,
    heroEyebrow: "App ChatGPT · corrections demandées",
    heroActions: [
      '<a class="btn primary" href="#tester">Voir le statut de la bêta</a>',
      '<a class="btn secondary" href="/telecharger-scanner-ia-local">Télécharger Local Cockpit</a>',
    ],
    honest: `<strong>Statut honnête :</strong> OpenAI a demandé des corrections sur la soumission initiale. L'app n'est ni approuvée ni publiée ; le serveur MCP développeur reste disponible uniquement pour diagnostic et recette.`,
    directoryQuestion: "L'app OutilsIA est-elle publiée dans l'annuaire ChatGPT ?",
    directoryAnswer: "Non. OpenAI a demandé des corrections sur la soumission. Une nouvelle version devra être vérifiée puis soumise avant toute publication.",
    tester: {
      badge: "Corrections demandées",
      title: "Bêta développeur en correction",
      lead: "La version publique du serveur MCP reste bornée en lecture seule. La fiche du répertoire ne sera pas annoncée avant une nouvelle approbation.",
      action: '<div class="code-block">https://outilsia.fr/mcp</div>',
      steps: [
        ["Lire la demande du reviewer", "Corriger uniquement les points explicitement demandés et les défauts de production confirmés."],
        ["Relancer toute la recette", "Vérifier outils, widget, tests positifs et négatifs, pages légales et vidéo."],
        ["Soumettre une nouvelle version", "Ne pas annoncer d'approbation ou de publication avant le retour du portail."],
      ],
    },
    independent: "OutilsIA.fr est un service indépendant. La présence d'une soumission en correction ne constitue ni un partenariat, ni une validation ou certification par OpenAI.",
    footer: "OutilsIA pour ChatGPT · corrections demandées",
    scannerPill: "App ChatGPT · corrections demandées",
    scannerLead: "Le serveur MCP développeur reste disponible en lecture seule, mais la soumission publique doit être corrigée avant une nouvelle revue.",
    scannerStatus: `Statut public exact : corrections demandées après la soumission du ${submitted}. L'app n'est ni approuvée ni publiée dans le répertoire ChatGPT.`,
    termsStatus: `OpenAI a demandé des corrections sur la soumission envoyée le ${submitted}. Le service demeure une bêta développeur et n'est pas présenté comme approuvé ou publié dans le répertoire ChatGPT.`,
    termsAccess: "L'accès actuel est réservé à la recette en mode développeur. Aucun compte OutilsIA n'est exigé pour une estimation déclarative. Un compte OutilsIA est nécessaire seulement pour créer et gérer un rapport partagé depuis Local Cockpit.",
    llmsStatus: `- Status checked on ${status.last_checked_on}: OpenAI requested changes to the submission sent on ${status.submitted_on}; the app is not approved or published in the ChatGPT Plugins Directory.`,
  };
}

export const PUBLICATION_STATES = Object.freeze([...STATES]);
