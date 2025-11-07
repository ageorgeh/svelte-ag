import { Pagination as PaginationPrimitive } from 'bits-ui';
import { type Props } from '$shadcn//button/index.js';
type $$ComponentProps = PaginationPrimitive.PageProps &
  Props & {
    isActive: boolean;
  };
declare const PaginationLink: import('svelte').Component<$$ComponentProps, {}, 'ref'>;
type PaginationLink = ReturnType<typeof PaginationLink>;
export default PaginationLink;
