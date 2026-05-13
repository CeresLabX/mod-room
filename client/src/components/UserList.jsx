import React from 'react';

export default function UserList({ users, nickname, hostNickname }) {
  return (
    <div className="users-panel">
      <div className="users-header">
        {'>> ROOM USERS'} ({users.length} online)
      </div>
      <div className="users-list">
        {users.length === 0 ? (
          <span className="text-dim text-xs">No users yet</span>
        ) : (
          users.map((u) => {
            const isSelf = u.nickname === nickname;
            const isHost = u.nickname === hostNickname;
            let cls = 'user-badge';
            if (isHost) cls += ' host';
            else if (isSelf) cls += ' self';

            return (
              <span key={u.nickname} className={cls} title={isHost ? 'Room host' : isSelf ? 'You' : u.nickname}>
                {u.nickname}
                {isHost && ' *'}
                {isSelf && ' (you)'}
              </span>
            );
          })
        )}
      </div>
    </div>
  );
}
