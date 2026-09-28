#include <bits/stdc++.h>
using namespace std;
int main(){int R,C;cin>>R>>C;vector<string>g(R);for(auto&s:g)cin>>s;int cnt=0;for(int i=0;i<R;i++)for(int j=0;j<C;j++)if(g[i][j]=='1'){cnt++;queue<pair<int,int>>q;q.push({i,j});g[i][j]='0';while(!q.empty()){auto [x,y]=q.front();q.pop();int dx[]={1,-1,0,0},dy[]={0,0,1,-1};for(int d=0;d<4;d++){int nx=x+dx[d],ny=y+dy[d];if(nx>=0&&ny>=0&&nx<R&&ny<C&&g[nx][ny]=='1'){g[nx][ny]='0';q.push({nx,ny});}}}}cout<<cnt<<"\n";}
