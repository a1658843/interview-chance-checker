type JsonResponse = {
  status: (statusCode: number) => JsonResponse;
  json: (body: unknown) => void;
  setHeader?: (name: string, value: string) => void;
};

type AnalyzeRequest = {
  method?: string;
};

export default function handler(req: AnalyzeRequest, res: JsonResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader?.('Allow', 'GET, POST');
    res.status(405).json({ success: false, message: 'Method not allowed' });
    return;
  }

  res.status(200).json({
    success: true,
    message: 'API is working',
  });
}
