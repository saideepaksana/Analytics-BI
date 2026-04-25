import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import LegacyDataReviewPage from "../../../../client/src/modules/data-review/DataReviewPage.jsx";

export default function DataReviewPage({ datasetId }) {
  const [searchParams] = useSearchParams();

  const resolvedDatasetId = useMemo(() => {
    return datasetId || searchParams.get("datasetId") || "";
  }, [datasetId, searchParams]);

  return <LegacyDataReviewPage datasetId={resolvedDatasetId} />;
}
