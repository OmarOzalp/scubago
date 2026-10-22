import type { OpenLicence, SourceId } from '@/lib/external-sightings/types';

/**
 * The credit and licence texts for the attribution (credits) screen, and the lines stored with each
 * source. The wording follows docs/roadmap/external-sightings-research.md: individual records and
 * photos only under CC0 or CC BY, each credited and linked; counts credited to the source and its
 * data providers.
 */

export interface LicenceInfo {
  code: OpenLicence;
  /** Short name for a credit line. */
  label: string;
  name: string;
  url: string;
}

export const LICENCES: Readonly<Record<OpenLicence, LicenceInfo>> = {
  cc0: {
    code: 'cc0',
    label: 'CC0',
    name: 'CC0 1.0 Universal (public domain dedication)',
    url: 'https://creativecommons.org/publicdomain/zero/1.0/',
  },
  'cc-by': {
    code: 'cc-by',
    label: 'CC BY 4.0',
    name: 'Creative Commons Attribution 4.0 International',
    url: 'https://creativecommons.org/licenses/by/4.0/',
  },
};

/** Only these licence codes (as iNaturalist writes them, case aside) may be shown record by record. */
export function openLicence(code: unknown): OpenLicence | undefined {
  if (typeof code !== 'string') return undefined;
  const normalised = code.trim().toLowerCase();
  return normalised === 'cc0' || normalised === 'cc-by' ? normalised : undefined;
}

export interface SourceCredit {
  id: SourceId;
  name: string;
  /** The credit line stored in a summary's SourceStatus. */
  attribution: string;
  /** What is shown from this source and under which licence. */
  licenceNote: string;
  /** A paragraph for the credits screen. */
  description: string;
  homepage: string;
  termsUrl: string;
  /** How the source asks to be cited or used. */
  guidelinesUrl: string;
}

export const INATURALIST_CREDIT: SourceCredit = {
  id: 'inaturalist',
  name: 'iNaturalist',
  attribution: 'Observations by iNaturalist observers (inaturalist.org)',
  licenceNote: 'Counts cover all research-grade observations. Individual observations and photos are shown only under CC0 or CC BY, each credited to its observer.',
  description:
    'Sightings near each dive site come from iNaturalist, a joint initiative of the California Academy of Sciences and the National Geographic Society, and from the people who record them there. Only research-grade observations are used. An individual observation is shown only if its observer licensed it CC0 or CC BY, and a photo only if that photo carries one of those licences. Each is credited to its observer and links to its page on iNaturalist. ScubaGo is not endorsed by iNaturalist.',
  homepage: 'https://www.inaturalist.org',
  termsUrl: 'https://www.inaturalist.org/terms',
  guidelinesUrl: 'https://www.inaturalist.org/pages/api+recommended+practices',
};

export const OBIS_CREDIT: SourceCredit = {
  id: 'obis',
  name: 'OBIS',
  attribution: 'OBIS and its data providers (obis.org)',
  licenceNote: 'Only counts of records per species are shown: aggregated facts, credited to OBIS and its data providers. No individual OBIS record is shown.',
  description:
    'Record counts per species come from the Ocean Biodiversity Information System (OBIS), a global open-access data system hosted by UNESCO’s Intergovernmental Oceanographic Commission, and from the many data providers who contribute to it. ScubaGo shows only how many records OBIS holds near a site for each animal, not the records themselves. ScubaGo is not endorsed by OBIS or its providers.',
  homepage: 'https://obis.org',
  termsUrl: 'https://manual.obis.org/policy.html',
  guidelinesUrl: 'https://manual.obis.org/citing.html',
};

export const SOURCE_CREDITS: Readonly<Record<SourceId, SourceCredit>> = {
  inaturalist: INATURALIST_CREDIT,
  obis: OBIS_CREDIT,
};

/** How OBIS asks to be cited. */
export const OBIS_CITATION = 'OBIS. Ocean Biodiversity Information System. Intergovernmental Oceanographic Commission of UNESCO. https://obis.org';

/** A short note for the foot of any screen that shows real sightings. */
export const REAL_SIGHTINGS_FOOTNOTE =
  'Real sightings come from iNaturalist observers and OBIS. Positions are never shown. Dates are when the animal was seen, not when it was uploaded.';

/** The credit line for one observation: "© Ada Diver, CC BY 4.0 (iNaturalist)". */
export function observationCredit(observer: string, licence: OpenLicence): string {
  return licence === 'cc0'
    ? `${observer}, ${LICENCES.cc0.label} (iNaturalist)`
    : `© ${observer}, ${LICENCES[licence].label} (iNaturalist)`;
}

/** iNaturalist's own wording for a photo, used when the API does not send an attribution string. */
export function photoCreditFallback(observer: string, licence: OpenLicence): string {
  return licence === 'cc0'
    ? `no rights reserved, uploaded by ${observer} (CC0)`
    : `(c) ${observer}, some rights reserved (CC BY)`;
}
