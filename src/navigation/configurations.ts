import type { VerifiedConfiguration } from './model';

/** Add only inspected, evidenced installed configurations. A source year is not fitment proof.
 * Never preselect an OEM variant because its source is newer or it has a 3D mapping.
 * Each assignment targets a curated component role and the existing occurrence ID(s).
 */
export const verifiedConfigurations: VerifiedConfiguration[] = [];
