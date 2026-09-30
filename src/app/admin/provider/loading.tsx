import ProviderDirectory from '@/components/provider/provider-directory';

export default function ProviderConsoleLoading() {
  return <ProviderDirectory state={{ kind: 'loading' }} />;
}
