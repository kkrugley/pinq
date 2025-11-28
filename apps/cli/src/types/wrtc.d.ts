declare module "@roamhq/wrtc" {
  const wrtc: {
    RTCPeerConnection: typeof RTCPeerConnection;
    RTCSessionDescription: typeof RTCSessionDescription;
    RTCIceCandidate: typeof RTCIceCandidate;
  };

  export = wrtc;
}
