/**
 * What the monthly job downloads. One entry per file.
 *
 * The CSV links are the portal's own "download" links. They answer with a redirect to a temporary signed address,
 * so the job follows redirects and records the portal link, not the temporary one.
 */

export interface Source {
  id: string;
  title: string;
  publisher: string;
  /** The dataset page, for people. */
  landingUrl: string;
  /** The file, for the job. */
  downloadUrl: string;
  year: number;
  licence: string;
  licenceUrl: string;
  attribution: string;
}

const DATASET = 'https://open.canada.ca/data/en/dataset/98f1a129-f628-4ce4-b24d-6f16bf24dd64';

export const SOURCES: Source[] = [
  {
    id: 'nrcan-fcr-my2026',
    title: 'Fuel Consumption Ratings, model year 2026',
    publisher: 'Natural Resources Canada',
    landingUrl: DATASET,
    downloadUrl: `${DATASET}/resource/9df1b18d-d036-4783-a61c-99f1f75b3ac5/download/my2026-fuel-consumption-ratings.csv`,
    year: 2026,
    licence: 'Open Government Licence – Canada',
    licenceUrl: 'https://open.canada.ca/en/open-government-licence-canada',
    attribution: 'Contains information licensed under the Open Government Licence – Canada.',
  },
];
