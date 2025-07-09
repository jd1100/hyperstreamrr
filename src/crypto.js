// src/crypto.js
import crypto from 'hypercore-crypto';
import b4a from 'b4a';

export function createInvite(network, role, inviteeName = 'New Member') {
  if (role === 'admin' && !network.adminKeypair) {
    console.error('Admin keypair is missing for invite creation');
    throw new Error('Cannot create admin invite without an admin keypair.');
  }

  const invite = {
    network: network.key,
    name: network.name,
    role: role,
    adminAuth: null
  };

  if (role === 'admin') {
    const adminPublicKey = b4a.toString(network.adminKeypair.publicKey, 'hex');
    const message = {
      network: network.key,
      name: network.name,
      inviter: b4a.toString(network.autobase.local.key, 'hex'),
      inviteeName: inviteeName,
      role: 'admin',
      timestamp: Date.now()
    };

    const messageBuffer = b4a.from(JSON.stringify(message));
    const signature = crypto.sign(messageBuffer, network.adminKeypair.secretKey);

    invite.adminAuth = {
      message: message,
      signature: b4a.toString(signature, 'hex'),
      adminPublicKey: adminPublicKey
    };
  }

  return b4a.toString(b4a.from(JSON.stringify(invite)), 'base64');
}
