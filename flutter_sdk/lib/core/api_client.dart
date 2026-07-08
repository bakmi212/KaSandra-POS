/// HTTP API client for license server communication.
import 'dart:convert';
import 'package:http/http.dart' as http;

class ApiClient {
  String serverUrl;
  String projectApiKey;

  ApiClient({
    required this.serverUrl,
    required this.projectApiKey,
  });

  void updateConfig({required String serverUrl, required String projectApiKey}) {
    this.serverUrl = serverUrl.endsWith('/')
        ? serverUrl.substring(0, serverUrl.length - 1)
        : serverUrl;
    this.projectApiKey = projectApiKey;
  }

  Future<Map<String, dynamic>> post(String endpoint, Map<String, dynamic> body) async {
    final response = await http.post(
      Uri.parse('$serverUrl/v1/$endpoint'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode(body),
    );
    return jsonDecode(response.body) as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> get(String endpoint, Map<String, String> params) async {
    final uri = Uri.parse('$serverUrl/v1/$endpoint').replace(queryParameters: params);
    final response = await http.get(uri, headers: {'Content-Type': 'application/json'});
    return jsonDecode(response.body) as Map<String, dynamic>;
  }
}
