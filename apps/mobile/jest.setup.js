jest.mock('react-native-chessboard', () => {
  const React = require('react');

  return function ChessboardMock(props) {
    return React.createElement('Chessboard', { testID: 'mock-chessboard', fen: props.fen });
  };
});
