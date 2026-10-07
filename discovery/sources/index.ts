import { DiscoverySourceModule } from '../types';
import { pubmedSource } from './pubmed';
import { europePmcSource } from './europepmc';
import { semanticScholarSource } from './semanticscholar';
import { crossrefSource } from './crossref';
import { orcidSource } from './orcid';
import { clinicalTrialsSource } from './clinicaltrials';
import { ukriSource } from './ukri';
import { nihReporterSource } from './nihreporter';
import { cordisSource } from './cordis';

export const ALL_DISCOVERY_SOURCES: DiscoverySourceModule[] = [
  pubmedSource,
  europePmcSource,
  semanticScholarSource,
  crossrefSource,
  orcidSource,
  clinicalTrialsSource,
  ukriSource,
  nihReporterSource,
  cordisSource,
];

export {
  pubmedSource,
  europePmcSource,
  semanticScholarSource,
  crossrefSource,
  orcidSource,
  clinicalTrialsSource,
  ukriSource,
  nihReporterSource,
  cordisSource,
};
