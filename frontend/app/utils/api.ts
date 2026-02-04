// API utility functions for frontend-backend communication

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

/**
 * Test connection to backend
 * @returns Promise with connection status
 */
export async function testBackendConnection() {
  try {
    const response = await fetch(`${API_BASE_URL}/health`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    console.log('✅ Backend Connection Successful:', data);
    return {
      success: true,
      data,
      message: 'Connected to backend successfully',
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Backend Connection Failed:', errorMessage);
    return {
      success: false,
      error: errorMessage,
      message: 'Failed to connect to backend',
    };
  }
}

/**
 * Test the connection and log results
 */
export async function runConnectionTest() {
  console.log('🔍 Testing Backend Connection...');
  const result = await testBackendConnection();
  
  if (result.success) {
    console.log('✅ Connection Test Passed');
    console.log('Status:', result.data?.status);
    console.log('Message:', result.data?.message);
    console.log('Uptime:', result.data?.uptime, 'seconds');
  } else {
    console.error('❌ Connection Test Failed');
    console.error('Error:', result.error);
  }
  
  return result;
}
